/* SPDX-License-Identifier: GPL-3.0-only
 * Molecular FX Lab — Native C99 DSP Test & Reference Generator (All 46 Effects)
 *
 * Compiles dsp/bridge/molecular_fx_bridge.c natively and validates ALL 46 Molecular effects:
 *   1. Silence, finite bounds, non-silent wet output on rich stimulus
 *   2. Raw Q15 32-sample block reference dumps (bit-exact 0-LSB target for WASM)
 *   3. Float32 44.1 kHz and 48.0 kHz AudioWorklet-chunk (128-frame) reference dumps
 *   4. Determinism on fx_reset(), root note tuning, live parameter sweeps, bypass & mono input
 */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

#include "molecular_fx_bridge.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static int g_fails = 0;
#define EXPECT(cond, ...) do { \
    if (!(cond)) { \
        g_fails++; \
        fprintf(stderr, "FAIL: " __VA_ARGS__); \
        fprintf(stderr, "\n"); \
    } \
} while (0)

static const char *FX_SLUGS[FX_ID_COUNT] = {
    "tape", "reverse", "glitch",
    "filter", "fold", "mulaw", "shift", "modal", "string", "vowel", "spring",
    "cloud", "scream", "ring", "starve", "cheb", "bank", "smear", "diffuse",
    "slew", "xor", "dust", "waveset", "xmod", "chaos",
    "delay", "reverb",
    "spiral", "source", "envel", "lpg", "barber", "stick", "morpho", "disintegrate",
    "reed", "nlf", "subharm", "spark", "contrast", "blur", "doppler", "gsm",
    "gendy", "invert", "squelch"
};

static void write_bin(const char *path, const void *data, size_t bytes)
{
    FILE *f = fopen(path, "wb");
    if (!f) { fprintf(stderr, "Cannot open %s\n", path); exit(1); }
    fwrite(data, 1, bytes, f);
    fclose(f);
}

/* Deterministic test stimulus: percussive plucks + sustained harmonics + impulse (shared with JS) */
static void generate_test_signal(float *l, float *r, int frames, int sr)
{
    for (int i = 0; i < frames; i++) {
        double t = (double)i / (double)sr;
        double beat_t = fmod(t, 0.20);
        double env = 0.25 + 0.75 * exp(-beat_t * 14.0);
        int step = (int)(t / 0.20) % 4;
        double freqs[4] = { 220.0, 277.1826, 329.6276, 440.0 };
        double f0 = freqs[step];
        double f1 = f0 * 1.5;
        double sl = (0.45 * sin(2.0 * M_PI * f0 * t) + 0.20 * sin(2.0 * M_PI * 2.0 * f0 * t)) * env;
        double sr_val = (0.45 * sin(2.0 * M_PI * f1 * t) + 0.15 * sin(2.0 * M_PI * 3.0 * f0 * t)) * env;
        if (i == 64) { sl += 0.35; sr_val += 0.35; }
        l[i] = (float)sl;
        r[i] = (float)sr_val;
    }
}

static void test_q15_raw_all_effects(void)
{
    /* 1024 blocks = 32,768 samples (~0.743 s) -> long enough for CLOUD buffer fill, GSM frames, DELAY, REVERB */
    const int nblocks = 1024;
    const int nsamples = nblocks * 32;
    int32_t *in_q15 = (int32_t *)malloc((size_t)nsamples * sizeof(int32_t));
    int32_t *out_all = (int32_t *)malloc((size_t)FX_ID_COUNT * (size_t)nsamples * sizeof(int32_t));

    /* Deterministic integer waveform: stepped tone + burst + impulses */
    for (int i = 0; i < nsamples; i++) {
        int32_t saw = ((i * 317) % 28000) - 14000;
        int32_t sq = ((i / 67) & 1) ? 9000 : -9000;
        int32_t active = (i < 24576) ? 1 : 0;
        int32_t imp = (i == 32 || i == 1024 || i == 8192) ? 18000 : 0;
        int32_t v = active ? ((saw + sq) / 2) : 0;
        v += imp;
        if (v > 30000) v = 30000;
        if (v < -30000) v = -30000;
        in_q15[i] = v;
    }

    for (int fx = 0; fx < FX_ID_COUNT; fx++) {
        int32_t *out_q15 = out_all + (size_t)fx * (size_t)nsamples;
        fx_init(44100, 128);
        EXPECT(fx_select(fx) == 0, "fx_select(%d) failed", fx);
        fx_reset();

        int32_t pk = 0;
        double energy = 0.0;
        for (int b = 0; b < nblocks; b++) {
            fx_process_q15_block_raw(fx, in_q15 + b * 32, out_q15 + b * 32, 1);
            for (int k = 0; k < 32; k++) {
                int32_t v = out_q15[b * 32 + k];
                int32_t av = v < 0 ? -v : v;
                if (av > pk) pk = av;
                energy += (double)v * (double)v;
            }
        }
        double rms = sqrt(energy / (double)nsamples);
        EXPECT(rms > 15.0, "Q15 raw [%02d] %s produced near silence (rms=%.2f)", fx, FX_SLUGS[fx], rms);
        EXPECT(pk <= 32768, "Q15 raw [%02d] %s exceeded Q15 full scale (pk=%d)", fx, FX_SLUGS[fx], pk);
        EXPECT(fx_get_state_bytes(fx) > 0, "fx_get_state_bytes(%d) returned 0", fx);
    }

    write_bin("build/dsp_ref_q15_all46.bin", out_all, (size_t)FX_ID_COUNT * (size_t)nsamples * sizeof(int32_t));
    printf("  [Q15 raw] All %d effects validated (rms > 15, peak <= 32768) -> build/dsp_ref_q15_all46.bin\n", FX_ID_COUNT);

    free(in_q15);
    free(out_all);
}

static void test_float32_all_effects(int sr)
{
    const int frames = (sr == 44100) ? 22016 : 24064; /* ~0.5 s, multiple of 128 */
    const int chunk = 128;
    float *in_l = (float *)calloc((size_t)frames, sizeof(float));
    float *in_r = (float *)calloc((size_t)frames, sizeof(float));
    float *out_l = (float *)calloc((size_t)frames, sizeof(float));
    float *out_r = (float *)calloc((size_t)frames, sizeof(float));
    float *ref_all = (float *)malloc((size_t)FX_ID_COUNT * (size_t)frames * 2u * sizeof(float));

    generate_test_signal(in_l, in_r, frames, sr);

    for (int fx = 0; fx < FX_ID_COUNT; fx++) {
        /* 1. Silence safety test */
        fx_init(sr, chunk);
        fx_select(fx);
        fx_set_mix(1.0f);
        fx_set_bypass(0);
        fx_reset();
        float z_in[128] = {0}, z_out_l[128], z_out_r[128];
        for (int b = 0; b < 32; b++) {
            fx_process(z_in, z_in, z_out_l, z_out_r, chunk);
            for (int k = 0; k < chunk; k++) {
                EXPECT(isfinite(z_out_l[k]) && isfinite(z_out_r[k]), "%s silence NaN/Inf at %d Hz", FX_SLUGS[fx], sr);
                EXPECT(fabsf(z_out_l[k]) <= 1.0f && fabsf(z_out_r[k]) <= 1.0f, "%s silence clip at %d Hz", FX_SLUGS[fx], sr);
            }
        }

        /* 2. Stereo wet+dry musical signal test */
        fx_init(sr, chunk);
        fx_select(fx);
        fx_set_mix(0.80f);
        fx_set_bypass(0);
        fx_set_input_gain(1.0f);
        fx_set_output_gain(1.0f);
        fx_reset();

        double energy = 0.0;
        for (int off = 0; off < frames; off += chunk) {
            int n = (frames - off < chunk) ? (frames - off) : chunk;
            fx_process(in_l + off, in_r + off, out_l + off, out_r + off, n);
            for (int k = 0; k < n; k++) {
                float vl = out_l[off + k], vr = out_r[off + k];
                EXPECT(isfinite(vl) && isfinite(vr), "%s %dHz NaN/Inf", FX_SLUGS[fx], sr);
                EXPECT(fabsf(vl) <= 1.0f && fabsf(vr) <= 1.0f, "%s %dHz clipped > 1.0", FX_SLUGS[fx], sr);
                energy += (double)vl * vl + (double)vr * vr;
            }
        }
        double rms = sqrt(energy / (2.0 * frames));
        EXPECT(rms > 0.01, "%s %dHz stereo rms too low (%.5f)", FX_SLUGS[fx], sr, rms);

        /* Store interleaved stereo reference */
        float *dst = ref_all + (size_t)fx * (size_t)frames * 2u;
        for (int i = 0; i < frames; i++) {
            dst[i * 2]     = out_l[i];
            dst[i * 2 + 1] = out_r[i];
        }

        /* 3. Determinism on reset (spot-check every effect) */
        float *out_l2 = (float *)calloc((size_t)frames, sizeof(float));
        float *out_r2 = (float *)calloc((size_t)frames, sizeof(float));
        fx_init(sr, chunk);
        fx_select(fx);
        fx_set_mix(0.80f);
        fx_reset();
        for (int off = 0; off < frames; off += chunk) {
            int n = (frames - off < chunk) ? (frames - off) : chunk;
            fx_process(in_l + off, in_r + off, out_l2 + off, out_r2 + off, n);
        }
        float max_reset_diff = 0.0f;
        for (int i = 0; i < frames; i++) {
            float d = fabsf(out_l[i] - out_l2[i]);
            if (d > max_reset_diff) max_reset_diff = d;
        }
        EXPECT(max_reset_diff == 0.0f, "%s %dHz reset not deterministic (diff=%.8f)", FX_SLUGS[fx], sr, max_reset_diff);
        free(out_l2);
        free(out_r2);
    }

    char ref_path[128];
    snprintf(ref_path, sizeof(ref_path), "build/dsp_ref_f32_%d_all46.bin", sr);
    write_bin(ref_path, ref_all, (size_t)FX_ID_COUNT * (size_t)frames * 2u * sizeof(float));
    printf("  [F32 %5d Hz] All %d effects validated (finite, bounded, deterministic) -> %s\n", sr, FX_ID_COUNT, ref_path);

    /* 4. Root note tuning test on pitched/resonator effects (MODAL, STRING, BANK, SOURCE, REED) */
    if (sr == 44100) {
        int pitched_ids[5] = { FX_ID_MODAL, FX_ID_STRING, FX_ID_BANK, FX_ID_SOURCE, FX_ID_REED };
        float *buf_a = (float *)calloc((size_t)frames, sizeof(float));
        float *buf_b = (float *)calloc((size_t)frames, sizeof(float));
        float *tmp_r = (float *)calloc((size_t)frames, sizeof(float));
        for (int idx = 0; idx < 5; idx++) {
            int fx = pitched_ids[idx];
            fx_init(44100, chunk);
            fx_select(fx);
            fx_set_mix(1.0f);
            fx_set_root_note(48);
            fx_reset();
            for (int off = 0; off < frames; off += chunk)
                fx_process(in_l + off, in_r + off, buf_a + off, tmp_r + off, chunk);

            fx_init(44100, chunk);
            fx_select(fx);
            fx_set_mix(1.0f);
            fx_set_root_note(55);
            fx_reset();
            for (int off = 0; off < frames; off += chunk)
                fx_process(in_l + off, in_r + off, buf_b + off, tmp_r + off, chunk);

            double diff_e = 0.0;
            for (int i = 0; i < frames; i++) {
                double d = (double)buf_a[i] - (double)buf_b[i];
                diff_e += d * d;
            }
            EXPECT(diff_e > 1e-3, "Root note change (48 -> 55) had no effect on %s", FX_SLUGS[fx]);
        }
        printf("  [Root Tuning] Verified rack_root tuning on MODAL, STRING, BANK, SOURCE, REED\n");
        free(buf_a); free(buf_b); free(tmp_r);
    }

    /* 5. Live parameter sweep + bypass + mono input test across representative effects */
    int sweep_ids[4] = { FX_ID_TAPE, FX_ID_REVERB, FX_ID_GSM, FX_ID_SPIRAL };
    for (int s = 0; s < 4; s++) {
        fx_init(sr, chunk);
        fx_select(sweep_ids[s]);
        fx_set_mix(0.8f);
        for (int off = 0; off < frames; off += chunk) {
            int n = (frames - off < chunk) ? (frames - off) : chunk;
            int step = (off / chunk) % 100;
            fx_set_param(0, step);
            fx_set_param(1, 100 - step);
            fx_set_param(2, (step * 3) % 90);
            fx_set_param(3, (step * 5) % 85);
            fx_set_bypass((off / chunk) % 40 >= 20 ? 1 : 0);
            fx_process(in_l + off, NULL, out_l + off, out_r + off, n);
            for (int k = 0; k < n; k++) {
                EXPECT(isfinite(out_l[off + k]) && fabsf(out_l[off + k]) <= 1.0f, "sweep invalid on %s", FX_SLUGS[sweep_ids[s]]);
                EXPECT(isfinite(out_r[off + k]) && fabsf(out_r[off + k]) <= 1.0f, "sweep R invalid on %s", FX_SLUGS[sweep_ids[s]]);
            }
        }
    }

    free(in_l); free(in_r); free(out_l); free(out_r); free(ref_all);
}

int main(void)
{
    printf("=== Molecular FX Lab: Native C99 Bridge Validation (All %d Effects) ===\n", FX_ID_COUNT);
    EXPECT(fx_get_effect_count() == FX_ID_COUNT, "fx_get_effect_count mismatch");
    test_q15_raw_all_effects();
    test_float32_all_effects(44100);
    test_float32_all_effects(48000);
    if (g_fails) {
        fprintf(stderr, "FAILED: %d check(s) failed\n", g_fails);
        return 1;
    }
    printf("Native C99 DSP bridge validation (%d/46 effects): ALL PASSED\n", FX_ID_COUNT);
    return 0;
}
