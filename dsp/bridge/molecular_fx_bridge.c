/* SPDX-License-Identifier: GPL-3.0-only
 * Molecular FX Lab — External Audio DSP Bridge (C99 / WebAssembly, Full 46-Effect Suite)
 *
 * Provenance (ALL upstream DSP files included UNMODIFIED):
 *   - Fixed-point math & SVF/PRNG helpers: core/vendor/tonitor/dsp.h (GPL-3.0-only, Nuno Zimas)
 *   - Lookup tables: generated verbatim by tools/gen_tables.py -> build/tonitor_tables.h
 *   - Tonitor heavy stereo effects: core/vendor/tonitor/reverb.c, delay.c (GPL-3.0-only, Nuno Zimas)
 *   - Norilsk 25 effects: core/vendor/norilsk/tables.h, effects.c (GPL-3.0-only, Nuno Zimas)
 *   - GSM 06.10 full-rate codec: core/gsm.c + core/vendor/gsm/ (Degener/Bormann, permissive + GPL-3.0-only wrapper)
 *   - Molecular 19 own atoms: core/atoms.c (GPL-3.0-only, Nuno Zimas)
 *   - Peak rider guard (fx_guard) & CHAOS priming: core/fx.c (GPL-3.0-only, Nuno Zimas)
 *   - Mu-law codec & helpers: core/molecular.c lines 11-36 (GPL-3.0-only, Nuno Zimas)
 *
 * Design:
 *   - Zero dynamic allocation inside fx_process() or any audio-path function.
 *   - Preserves original Q15 integer DSP at FS = 44100 Hz, CTL = 32 samples/block.
 *   - Runs two independent effect instances (L/R) for all 44 mono atoms; true-stereo
 *     figure-8 Dattorro tank for REVERB and stereo return for DELAY.
 *   - Transparent 4-point Catmull-Rom cubic Hermite resampler when host_sr != 44100 Hz.
 *   - Per-sample smoothed gains, Dry/Wet mix, click-free bypass and effect switching.
 */

#ifndef HOST
#define HOST 1
#endif

#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <math.h>

#include "molecular_fx_bridge.h"

/* --- Upstream Molecular / Tonitor / Norilsk / GSM / Atoms core (UNMODIFIED) --- */
#include "tonitor_tables.h"
#include "vendor/tonitor/dsp.h"

/* Verbatim from core/molecular.c lines 11-36 */
static inline int32_t gr_dec(uint8_t b)
{
    int32_t m = MULAW_DEC[b & 0x7Fu];
    return b & 0x80u ? -m : m;
}
static inline uint8_t gr_enc(int32_t x)
{
    uint32_t a = (uint32_t)(x < 0 ? -x : x);
    if (a > 32767u)
        a = 32767u;
    return (uint8_t)((x < 0 ? 0x80u : 0u) | MULAW_ENC[a >> 4]);
}

#define LV(x) ((int32_t)((x) * 32768.0))

#include "vendor/tonitor/reverb.c"
#include "vendor/tonitor/delay.c"

AINL int32_t mulz15(int32_t a, int32_t b)
{
    int64_t m = (int64_t)a * b;
    return (int32_t)(m < 0 ? -((-m) >> 15) : m >> 15);
}
AINL int32_t mini(int32_t a, int32_t b) { return a < b ? a : b; }
AINL uint32_t ms_samples2(uint32_t ms) { return ms * 2205u / 100u; }
AINL uint32_t ms_blocks(uint32_t ms) { return (ms * 1411u) >> 10; }

#include "vendor/norilsk/tables.h"
#include "vendor/norilsk/effects.c"
#include "gsm.c"
#include "atoms.c"

/* --- Bridge Static Memory & State --- */

/* Each stereo channel gets an 8-byte-aligned slot large enough for ANY Norilsk or atoms.c struct
 * (largest are m_tap_t ~19,952 B, m_rvs_t ~19,864 B, nx_spiral_t ~16,464 B, nx_morpho_t ~16,320 B). */
#define FX_SLOT_BYTES 24576u
static uint8_t g_fx_slot[2][FX_SLOT_BYTES] __attribute__((aligned(8)));
static int g_stereo_decorrelate = 0;

/* Compile-time verification that every single mono effect struct fits inside FX_SLOT_BYTES */
_Static_assert(sizeof(m_tap_t)      <= FX_SLOT_BYTES, "m_tap_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(m_rvs_t)      <= FX_SLOT_BYTES, "m_rvs_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(m_glt_t)      <= FX_SLOT_BYTES, "m_glt_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(m_cld_t)      <= FX_SLOT_BYTES, "m_cld_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(m_spr_t)      <= FX_SLOT_BYTES, "m_spr_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(m_str_t)      <= FX_SLOT_BYTES, "m_str_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(m_wst_t)      <= FX_SLOT_BYTES, "m_wst_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(nx_spiral_t)  <= FX_SLOT_BYTES, "nx_spiral_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(nx_morpho_t)  <= FX_SLOT_BYTES, "nx_morpho_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(nx_doppler_t) <= FX_SLOT_BYTES, "nx_doppler_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(nx_gsm_t)     <= FX_SLOT_BYTES, "nx_gsm_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(nx_disint_t)  <= FX_SLOT_BYTES, "nx_disint_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(nx_reed_t)    <= FX_SLOT_BYTES, "nx_reed_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(nx_blur_t)    <= FX_SLOT_BYTES, "nx_blur_t exceeds FX_SLOT_BYTES");
_Static_assert(sizeof(nx_contrast_t)<= FX_SLOT_BYTES, "nx_contrast_t exceeds FX_SLOT_BYTES");

/* Deterministic instance placement required by core/vendor/norilsk/effects.c (m_glt, m_cld, m_smr, m_dst, m_wst) */
static uint32_t fx_place(const void *st)
{
    const uint8_t *p = (const uint8_t *)st;
    if (p >= g_fx_slot[0] && p < g_fx_slot[0] + FX_SLOT_BYTES)
        return 0u;
    if (p >= g_fx_slot[1] && p < g_fx_slot[1] + FX_SLOT_BYTES)
        return g_stereo_decorrelate ? FX_SLOT_BYTES : 0u;
    return 0u;
}

/* Verbatim Norilsk output guard (core/fx.c lines 168-187): peak rider to half scale + Q15 clamp */
typedef struct {
    int32_t env;
    int32_t g;
} guard_state_t;

static guard_state_t g_guard[2];

static void bridge_guard_reset(guard_state_t *s)
{
    s->env = 0;
    s->g = Q15;
}

static void bridge_guard_run(guard_state_t *s, int32_t *x)
{
    int32_t pk = 0, want, g0 = s->g, dg;
    uint32_t i;
    for (i = 0; i < CTL; i++)
        pk = maxi(pk, absi(x[i]));
    if (pk > s->env)
        s->env = pk;
    else
        s->env -= s->env >> 8;
    want = s->env > 16384 ? (int32_t)((uint32_t)16384 * 32768u / (uint32_t)s->env) : Q15;
    if (want > g0 && g0 < Q15)
        want = g0 + ((want - g0) >> 3);
    dg = (want - g0) / (int32_t)CTL;
    for (i = 0; i < CTL; i++) {
        g0 += dg;
        x[i] = clampi(mulq15(x[i], g0), -Q15, Q15);
    }
    s->g = want;
}

/* --- Ring Buffers & Sample Rate Adapter --- */
#define RING_CAP 2048u
#define RING_MASK (RING_CAP - 1u)
#define RESAMP_PRIME_DSP 64u

typedef struct {
    float data[RING_CAP];
    uint32_t r;
    uint32_t w;
    uint32_t count;
} float_ring_t;

static inline void ring_clear(float_ring_t *q)
{
    q->r = 0;
    q->w = 0;
    q->count = 0;
}

static inline void ring_push(float_ring_t *q, float v)
{
    if (q->count >= RING_CAP) {
        q->r = (q->r + 1u) & RING_MASK;
        q->count--;
    }
    q->data[q->w] = v;
    q->w = (q->w + 1u) & RING_MASK;
    q->count++;
}

static inline float ring_pop(float_ring_t *q)
{
    if (q->count == 0u)
        return 0.0f;
    float v = q->data[q->r];
    q->r = (q->r + 1u) & RING_MASK;
    q->count--;
    return v;
}

/* 4-point Catmull-Rom cubic Hermite interpolation */
static inline float hermite4(float y0, float y1, float y2, float y3, float t)
{
    float c0 = y1;
    float c1 = 0.5f * (y2 - y0);
    float c2 = y0 - 2.5f * y1 + 2.0f * y2 - 0.5f * y3;
    float c3 = 0.5f * (y3 - y0) + 1.5f * (y1 - y2);
    return ((c3 * t + c2) * t + c1) * t + c0;
}

/* Sanitize float32 input against NaN, Inf, and subnormals */
static inline float sanitize_f32(float x)
{
    if (!(x == x))
        return 0.0f;
    if (x > 16.0f)
        return 16.0f;
    if (x < -16.0f)
        return -16.0f;
    if (x > -1e-20f && x < 1e-20f)
        return 0.0f;
    return x;
}

static inline int32_t f32_to_q15(float x)
{
    float s = sanitize_f32(x);
    if (s > 1.0f) s = 1.0f;
    else if (s < -1.0f) s = -1.0f;
    int32_t q = (int32_t)(s * 32767.0f + (s >= 0.0f ? 0.5f : -0.5f));
    return clampi(q, -32767, 32767);
}

static inline float q15_to_f32(int32_t q)
{
    int32_t c = clampi(q, -32768, 32767);
    return (float)c * (1.0f / 32768.0f);
}

/* --- Engine Global State (Static, Zero-Allocation) --- */
static int g_initialized = 0;
static int g_host_sr = FS;
static int g_resampling = 0;
static int g_latency_samples = 0;
static int g_effect_id = FX_ID_TAPE;
static uint8_t g_params[4] = {50, 30, 45, 40};
static uint32_t g_heavy_param_key = 0xFFFFFFFFu;
static int g_guard_enabled = 1;

/* Smoothed control parameters */
static float g_in_gain_target = 1.0f,  g_in_gain_cur = 1.0f;
static float g_out_gain_target = 1.0f, g_out_gain_cur = 1.0f;
static float g_mix_target = 0.65f,     g_mix_cur = 0.65f;
static float g_bypass_target = 0.0f,   g_bypass_cur = 0.0f;
static float g_switch_fade = 1.0f;
static float g_smooth_step = 0.0045f;

/* CTL = 32 block accumulator at native 44.1 kHz */
static int32_t g_blk_in[2][CTL];
static uint32_t g_blk_pos = 0;

/* Native-rate wet output ring buffer */
static float_ring_t g_wet_ring[2];
/* Host-rate dry alignment buffer */
static float_ring_t g_dry_ring[2];

/* Resampler state (host_sr <-> 44100 Hz) */
static double g_in_step = 1.0;
static double g_in_phase = 0.0;
static float  g_in_hist[2][4];

static double g_out_step = 1.0;
static double g_out_phase = 0.0;
static float  g_out_hist[2][4];

/* Pre-allocated AudioWorklet I/O buffers in WASM linear memory */
static float g_io_in_l[FX_MAX_IO_FRAMES];
static float g_io_in_r[FX_MAX_IO_FRAMES];
static float g_io_out_l[FX_MAX_IO_FRAMES];
static float g_io_out_r[FX_MAX_IO_FRAMES];

/* Peak meters */
static float g_peak_in_l = 0.0f, g_peak_in_r = 0.0f;
static float g_peak_out_l = 0.0f, g_peak_out_r = 0.0f;

/* Live effect telemetry buffer (8 int32 slots) */
static int32_t g_telemetry[8];

/* Curated defaults for the 19 Molecular own atoms (within NX_LO..NX_HI) */
static const uint8_t NX_HOME[NX_N][4] = {
    {62, 55, 45, 25}, /* SPIRAL: +interval, feedback, time, splice */
    {65, 50, 35, 60}, /* SOURCE: excitation, buzz pitch, hold, order */
    {25, 45, 20, 35}, /* ENVEL: swell/sharpen, time, invert, floor */
    {55, 50, 60, 40}, /* LPG: sensitivity, decay, colour, uncertainty */
    {65, 55, 55, 70}, /* BARBER: rate, range, feedback, depth */
    {45, 50, 40, 65}, /* STICK: friction, spring, damping, drive */
    {60, 30, 45, 35}, /* MORPHO: time, tilt, feedback, scatter */
    {55, 55, 50, 40}, /* DISINTEGRATE: drive, length, layers, smoothing */
    {50, 60, 55, 50}, /* REED: pitch, pressure, brightness, damping */
    {55, 45, 50, 45}, /* NLF: feedback, resonance, nonlinearity, lag */
    {35, 65, 40, 60}, /* SUBHARM: divisor A, divisor B, mix, tone */
    {50, 45, 45, 30}, /* SPARK: pitch, decay, grit, threshold */
    {65, 30, 50, 45}, /* CONTRAST: contrast, trace, resolution, speed */
    {55, 35, 50, 40}, /* BLUR: blur, freeze, excitation, drift */
    {45, 60, 65, 40}, /* DOPPLER: speed, size, pass, air */
    {55, 60, 60, 20}, /* GSM: rate, level, tone, stutter */
    {50, 45, 40, 40}, /* GENDY: breakpoints, amp walk, dur walk, anchor */
    {45, 50, 35, 70}, /* INVERT: mirror, shift, resonance, bandwidth */
    {45, 40, 45, 50}, /* SQUELCH: rate, meltdown, squelch, follow */
};

/* Map bridge FX_ID_* -> Norilsk RM_* index (-1 if Molecular atoms.c) */
static int fx_id_to_rm(int effect_id)
{
    switch (effect_id) {
    case FX_ID_TAPE:    return RM_TAP;
    case FX_ID_REVERSE: return RM_RVS;
    case FX_ID_GLITCH:  return RM_GLT;
    case FX_ID_FILTER:  return RM_FLT;
    case FX_ID_FOLD:    return RM_FLD;
    case FX_ID_MULAW:   return RM_MU;
    case FX_ID_SHIFT:   return RM_SHF;
    case FX_ID_MODAL:   return RM_MDL;
    case FX_ID_STRING:  return RM_STR;
    case FX_ID_VOWEL:   return RM_VOW;
    case FX_ID_SPRING:  return RM_SPR;
    case FX_ID_CLOUD:   return RM_CLD;
    case FX_ID_SCREAM:  return RM_SCR;
    case FX_ID_RING:    return RM_RNG;
    case FX_ID_STARVE:  return RM_STV;
    case FX_ID_CHEB:    return RM_CHB;
    case FX_ID_BANK:    return RM_BNK;
    case FX_ID_SMEAR:   return RM_SMR;
    case FX_ID_DIFFUSE: return RM_DIF;
    case FX_ID_SLEW:    return RM_SLW;
    case FX_ID_XOR:     return RM_XOR;
    case FX_ID_DUST:    return RM_DST;
    case FX_ID_WAVESET: return RM_WST;
    case FX_ID_XMOD:    return RM_XMD;
    case FX_ID_CHAOS:   return RM_CHS;
    case FX_ID_DELAY:   return RM_DLY;
    case FX_ID_REVERB:  return RM_REV;
    default:            return -1;
    }
}

/* Map bridge FX_ID_* -> atoms.c NX_* index (-1 if Norilsk/Tonitor) */
static int fx_id_to_nx(int effect_id)
{
    if (effect_id >= FX_ID_SPIRAL && effect_id < FX_ID_COUNT)
        return effect_id - FX_ID_SPIRAL;
    return -1;
}

static void load_default_params_for_effect(int effect_id)
{
    int rm = fx_id_to_rm(effect_id);
    if (rm >= 0) {
        for (int i = 0; i < 4; i++)
            g_params[i] = RM_HOME[rm][i];
        return;
    }
    int nx = fx_id_to_nx(effect_id);
    if (nx >= 0 && nx < NX_N) {
        for (int i = 0; i < 4; i++)
            g_params[i] = NX_HOME[nx][i];
    }
}

static void sync_heavy_params(int effect_id)
{
    uint32_t k = p_key(g_params) ^ ((uint32_t)effect_id << 28);
    if (k == g_heavy_param_key)
        return;
    if (effect_id == FX_ID_DELAY) {
        dl_param(g_params[0], g_params[1], g_params[2], g_params[3]);
        g_heavy_param_key = k;
    } else if (effect_id == FX_ID_REVERB) {
        rv_param(g_params[0], g_params[1], g_params[2], g_params[3]);
        g_heavy_param_key = k;
    }
}

static void run_mono_effect_block_ch(int effect_id, int ch, int32_t *buf, int use_guard)
{
    void *st = (void *)g_fx_slot[ch];
    switch (effect_id) {
    /* 25 Norilsk effects */
    case FX_ID_TAPE:    m_tap(g_params, (m_tap_t *)st, buf); break;
    case FX_ID_REVERSE: m_rvs(g_params, (m_rvs_t *)st, buf); break;
    case FX_ID_GLITCH:  m_glt(g_params, (m_glt_t *)st, buf); break;
    case FX_ID_FILTER:  m_flt(g_params, (m_flt_t *)st, buf); break;
    case FX_ID_FOLD:    m_fld(g_params, (m_fld_t *)st, buf); break;
    case FX_ID_MULAW:   m_mu(g_params,  (m_mu_t  *)st, buf); break;
    case FX_ID_SHIFT:   m_shf(g_params, (m_shf_t *)st, buf); break;
    case FX_ID_MODAL:   m_mdl(g_params, (m_mdl_t *)st, buf); break;
    case FX_ID_STRING:  m_str(g_params, (m_str_t *)st, buf); break;
    case FX_ID_VOWEL:   m_vow(g_params, (m_vow_t *)st, buf); break;
    case FX_ID_SPRING:  m_spr(g_params, (m_spr_t *)st, buf); break;
    case FX_ID_CLOUD:   m_cld(g_params, (m_cld_t *)st, buf); break;
    case FX_ID_SCREAM:  m_scr(g_params, (m_scr_t *)st, buf); break;
    case FX_ID_RING:    m_rng(g_params, (m_rng_t *)st, buf); break;
    case FX_ID_STARVE:  m_stv(g_params, (m_stv_t *)st, buf); break;
    case FX_ID_CHEB:    m_chb(g_params, (m_chb_t *)st, buf); break;
    case FX_ID_BANK:    m_bnk(g_params, (m_bnk_t *)st, buf); break;
    case FX_ID_SMEAR:   m_smr(g_params, (m_smr_t *)st, buf); break;
    case FX_ID_DIFFUSE: m_dif(g_params, (m_dif_t *)st, buf); break;
    case FX_ID_SLEW:    m_slw(g_params, (m_slw_t *)st, buf); break;
    case FX_ID_XOR:     m_xor(g_params, (m_xor_t *)st, buf); break;
    case FX_ID_DUST:    m_dst(g_params, (m_dst_t *)st, buf); break;
    case FX_ID_WAVESET: m_wst(g_params, (m_wst_t *)st, buf); break;
    case FX_ID_XMOD:    m_xmd(g_params, (m_xmd_t *)st, buf); break;
    case FX_ID_CHAOS:   m_chs(g_params, (m_chs_t *)st, buf); break;
    default: {
        int nx = fx_id_to_nx(effect_id);
        if (nx >= 0 && nx < NX_N)
            nx_block((uint32_t)nx, g_params, st, buf);
        break;
    }
    }
    if (use_guard)
        bridge_guard_run(&g_guard[ch], buf);
}

static void run_stereo_block(int effect_id, int32_t *buf_l, int32_t *buf_r, int use_guard)
{
    if (effect_id == FX_ID_DELAY) {
        int32_t mono[CTL], ol[CTL], or_[CTL], rvin[CTL];
        sync_heavy_params(FX_ID_DELAY);
        for (uint32_t i = 0; i < CTL; i++) {
            mono[i] = (buf_l[i] + buf_r[i]) >> 1;
            ol[i] = 0;
            or_[i] = 0;
            rvin[i] = 0;
        }
        dl_block(mono, ol, or_, rvin);
        for (uint32_t i = 0; i < CTL; i++) {
            buf_l[i] = clampi(ol[i], -Q15, Q15);
            buf_r[i] = clampi(or_[i], -Q15, Q15);
        }
        if (use_guard) {
            bridge_guard_run(&g_guard[0], buf_l);
            bridge_guard_run(&g_guard[1], buf_r);
        }
        return;
    }

    if (effect_id == FX_ID_REVERB) {
        int32_t mono[CTL], ol[CTL], or_[CTL];
        sync_heavy_params(FX_ID_REVERB);
        for (uint32_t i = 0; i < CTL; i++) {
            mono[i] = (buf_l[i] + buf_r[i]) >> 1;
            ol[i] = 0;
            or_[i] = 0;
        }
        rv_block(mono, ol, or_, CTL);
        for (uint32_t i = 0; i < CTL; i++) {
            buf_l[i] = clampi(ol[i], -Q15, Q15);
            buf_r[i] = clampi(or_[i], -Q15, Q15);
        }
        if (use_guard) {
            bridge_guard_run(&g_guard[0], buf_l);
            bridge_guard_run(&g_guard[1], buf_r);
        }
        return;
    }

    run_mono_effect_block_ch(effect_id, 0, buf_l, use_guard);
    run_mono_effect_block_ch(effect_id, 1, buf_r, use_guard);
}

static void push_native_dsp_sample(float l_f32, float r_f32)
{
    g_blk_in[0][g_blk_pos] = f32_to_q15(l_f32);
    g_blk_in[1][g_blk_pos] = f32_to_q15(r_f32);
    g_blk_pos++;

    if (g_blk_pos >= CTL) {
        g_blk_pos = 0;
        run_stereo_block(g_effect_id, g_blk_in[0], g_blk_in[1], g_guard_enabled);
        for (uint32_t i = 0; i < CTL; i++) {
            ring_push(&g_wet_ring[0], q15_to_f32(g_blk_in[0][i]));
            ring_push(&g_wet_ring[1], q15_to_f32(g_blk_in[1][i]));
        }
    }
}

static void clear_buffers_and_state(int soft_ramp)
{
    memset(g_fx_slot, 0, sizeof(g_fx_slot));
    bridge_guard_reset(&g_guard[0]);
    bridge_guard_reset(&g_guard[1]);

    /* Initialize Tonitor heavy engines & re-apply current parameters */
    g_heavy_param_key = 0xFFFFFFFFu;
    if (g_effect_id == FX_ID_DELAY) {
        dl_param(g_params[0], g_params[1], g_params[2], g_params[3]);
        dl_init();
        g_heavy_param_key = p_key(g_params) ^ ((uint32_t)FX_ID_DELAY << 28);
    } else if (g_effect_id == FX_ID_REVERB) {
        rv_init();
        rv_param(g_params[0], g_params[1], g_params[2], g_params[3]);
        rv.scale = rv.scale_t;
        g_heavy_param_key = p_key(g_params) ^ ((uint32_t)FX_ID_REVERB << 28);
    } else if (g_effect_id == FX_ID_CHAOS) {
        /* Verbatim from core/fx.c lines 153-164: prime CHAOS with 1 silent block so its 10 Hz
         * DC blocker settles at its rest well without a startup transient spike. */
        int32_t z[CTL];
        memset(z, 0, sizeof(z));
        m_chs(g_params, (m_chs_t *)g_fx_slot[0], z);
        memset(z, 0, sizeof(z));
        m_chs(g_params, (m_chs_t *)g_fx_slot[1], z);
    }

    memset(g_blk_in, 0, sizeof(g_blk_in));
    g_blk_pos = 0;

    ring_clear(&g_wet_ring[0]);
    ring_clear(&g_wet_ring[1]);
    ring_clear(&g_dry_ring[0]);
    ring_clear(&g_dry_ring[1]);

    memset(g_in_hist, 0, sizeof(g_in_hist));
    memset(g_out_hist, 0, sizeof(g_out_hist));
    g_in_phase = 0.0;
    g_out_phase = 0.0;

    if (g_resampling) {
        for (uint32_t i = 0; i < RESAMP_PRIME_DSP; i++) {
            ring_push(&g_wet_ring[0], 0.0f);
            ring_push(&g_wet_ring[1], 0.0f);
        }
        int dry_prime = (int)((double)RESAMP_PRIME_DSP * (double)g_host_sr / (double)FS + 0.5);
        if (dry_prime < 0) dry_prime = 0;
        if (dry_prime > (int)(RING_CAP / 2u)) dry_prime = (int)(RING_CAP / 2u);
        for (int i = 0; i < dry_prime; i++) {
            ring_push(&g_dry_ring[0], 0.0f);
            ring_push(&g_dry_ring[1], 0.0f);
        }
        g_latency_samples = dry_prime;
    } else {
        g_latency_samples = 0;
    }

    g_switch_fade = soft_ramp ? 0.0f : 1.0f;
    memset(g_telemetry, 0, sizeof(g_telemetry));
}

static inline float smooth_toward(float cur, float target, float step)
{
    float d = target - cur;
    if (d > step) return cur + step;
    if (d < -step) return cur - step;
    return target;
}

/* --- Public Exported API --- */

int fx_init(int host_sample_rate, int max_block_frames)
{
    (void)max_block_frames;
    if (host_sample_rate < 8000 || host_sample_rate > 192000)
        host_sample_rate = FS;

    g_host_sr = host_sample_rate;
    g_resampling = (g_host_sr != FS) ? 1 : 0;
    g_in_step = (double)g_host_sr / (double)FS;
    g_out_step = (double)FS / (double)g_host_sr;

    float ramp_samples = (float)g_host_sr * 0.005f;
    g_smooth_step = (ramp_samples > 1.0f) ? (1.0f / ramp_samples) : 1.0f;

    rack_root = 48; /* C3 default root for MODAL, STRING, BANK, SOURCE, REED */
    dl_init();
    rv_init();

    g_effect_id = FX_ID_TAPE;
    load_default_params_for_effect(g_effect_id);

    g_in_gain_target = g_in_gain_cur = 1.0f;
    g_out_gain_target = g_out_gain_cur = 1.0f;
    g_mix_target = g_mix_cur = 0.65f;
    g_bypass_target = g_bypass_cur = 0.0f;
    g_guard_enabled = 1;
    g_stereo_decorrelate = 0;

    g_peak_in_l = g_peak_in_r = 0.0f;
    g_peak_out_l = g_peak_out_r = 0.0f;

    clear_buffers_and_state(0);
    g_initialized = 1;
    return 0;
}

void fx_destroy(void)
{
    clear_buffers_and_state(0);
    g_initialized = 0;
}

int fx_select(int effect_id)
{
    if (effect_id < 0 || effect_id >= FX_ID_COUNT)
        return -1;
    if (effect_id != g_effect_id) {
        g_effect_id = effect_id;
        load_default_params_for_effect(effect_id);
        clear_buffers_and_state(1);
    }
    return 0;
}

int fx_get_selected(void)
{
    return g_effect_id;
}

void fx_set_param(int param_index, int value_0_100)
{
    if (param_index < 0 || param_index >= 4)
        return;
    if (value_0_100 < 0) value_0_100 = 0;
    if (value_0_100 > 100) value_0_100 = 100;
    g_params[param_index] = (uint8_t)value_0_100;
}

int fx_get_param(int param_index)
{
    if (param_index < 0 || param_index >= 4)
        return 0;
    return (int)g_params[param_index];
}

void fx_set_root_note(int midi_note)
{
    rack_root = clampi(midi_note, 24, 84);
}

int fx_get_root_note(void)
{
    return (int)rack_root;
}

void fx_set_mix(float dry_wet_0_1)
{
    float v = sanitize_f32(dry_wet_0_1);
    if (v < 0.0f) v = 0.0f;
    if (v > 1.0f) v = 1.0f;
    g_mix_target = v;
}

void fx_set_bypass(int bypassed)
{
    g_bypass_target = bypassed ? 1.0f : 0.0f;
}

void fx_set_input_gain(float gain_linear)
{
    float v = sanitize_f32(gain_linear);
    if (v < 0.0f) v = 0.0f;
    if (v > 8.0f) v = 8.0f;
    g_in_gain_target = v;
}

void fx_set_output_gain(float gain_linear)
{
    float v = sanitize_f32(gain_linear);
    if (v < 0.0f) v = 0.0f;
    if (v > 8.0f) v = 8.0f;
    g_out_gain_target = v;
}

void fx_set_guard_enabled(int enabled)
{
    g_guard_enabled = enabled ? 1 : 0;
}

void fx_set_stereo_decorrelate(int enabled)
{
    int nv = enabled ? 1 : 0;
    if (nv != g_stereo_decorrelate) {
        g_stereo_decorrelate = nv;
        clear_buffers_and_state(1);
    }
}

void fx_reset(void)
{
    clear_buffers_and_state(1);
}

/* Direct Q15 32-sample block entrypoint for deterministic native-vs-WASM parity tests */
void fx_process_q15_block_raw(int effect_id, const int32_t *in32, int32_t *out32, int use_guard)
{
    if (!in32 || !out32 || effect_id < 0 || effect_id >= FX_ID_COUNT)
        return;

    if (effect_id == FX_ID_DELAY || effect_id == FX_ID_REVERB) {
        int32_t bl[CTL], br[CTL];
        for (uint32_t i = 0; i < CTL; i++) {
            bl[i] = in32[i];
            br[i] = in32[i];
        }
        run_stereo_block(effect_id, bl, br, use_guard);
        for (uint32_t i = 0; i < CTL; i++)
            out32[i] = bl[i];
        return;
    }

    for (uint32_t i = 0; i < CTL; i++)
        out32[i] = in32[i];
    run_mono_effect_block_ch(effect_id, 0, out32, use_guard);
}

void fx_process(const float *in_l, const float *in_r,
                float *out_l, float *out_r,
                int num_frames)
{
    if (!g_initialized || !in_l || !out_l || num_frames <= 0)
        return;
    if (num_frames > FX_MAX_IO_FRAMES)
        num_frames = FX_MAX_IO_FRAMES;

    const float *src_r = in_r ? in_r : in_l;

    float dry_buf_l[FX_MAX_IO_FRAMES];
    float dry_buf_r[FX_MAX_IO_FRAMES];

    for (int i = 0; i < num_frames; i++) {
        g_in_gain_cur = smooth_toward(g_in_gain_cur, g_in_gain_target, g_smooth_step * 4.0f);

        float xl = sanitize_f32(in_l[i]) * g_in_gain_cur;
        float xr = sanitize_f32(src_r[i]) * g_in_gain_cur;

        float al = xl < 0.0f ? -xl : xl;
        float ar = xr < 0.0f ? -xr : xr;
        if (al > g_peak_in_l) g_peak_in_l = al;
        if (ar > g_peak_in_r) g_peak_in_r = ar;

        if (!g_resampling) {
            dry_buf_l[i] = xl;
            dry_buf_r[i] = xr;
            push_native_dsp_sample(xl, xr);
        } else {
            ring_push(&g_dry_ring[0], xl);
            ring_push(&g_dry_ring[1], xr);

            g_in_hist[0][0] = g_in_hist[0][1];
            g_in_hist[0][1] = g_in_hist[0][2];
            g_in_hist[0][2] = g_in_hist[0][3];
            g_in_hist[0][3] = xl;

            g_in_hist[1][0] = g_in_hist[1][1];
            g_in_hist[1][1] = g_in_hist[1][2];
            g_in_hist[1][2] = g_in_hist[1][3];
            g_in_hist[1][3] = xr;

            g_in_phase -= 1.0;
            while (g_in_phase <= 0.0) {
                float t = (float)(1.0 + g_in_phase);
                if (t < 0.0f) t = 0.0f;
                if (t > 1.0f) t = 1.0f;
                float dl = hermite4(g_in_hist[0][0], g_in_hist[0][1], g_in_hist[0][2], g_in_hist[0][3], t);
                float dr = hermite4(g_in_hist[1][0], g_in_hist[1][1], g_in_hist[1][2], g_in_hist[1][3], t);
                push_native_dsp_sample(dl, dr);
                g_in_phase += g_in_step;
            }
        }
    }

    if (!g_resampling && (int)g_wet_ring[0].count < num_frames) {
        int deficit = num_frames - (int)g_wet_ring[0].count;
        float tmp_l[FX_MAX_IO_FRAMES], tmp_r[FX_MAX_IO_FRAMES];
        uint32_t existing = g_wet_ring[0].count;
        for (uint32_t k = 0; k < existing; k++) {
            tmp_l[k] = ring_pop(&g_wet_ring[0]);
            tmp_r[k] = ring_pop(&g_wet_ring[1]);
        }
        for (int k = 0; k < deficit; k++) {
            ring_push(&g_wet_ring[0], 0.0f);
            ring_push(&g_wet_ring[1], 0.0f);
        }
        for (uint32_t k = 0; k < existing; k++) {
            ring_push(&g_wet_ring[0], tmp_l[k]);
            ring_push(&g_wet_ring[1], tmp_r[k]);
        }
        g_latency_samples += deficit;
    }

    for (int i = 0; i < num_frames; i++) {
        float dl, dr, wl, wr;

        if (!g_resampling) {
            dl = dry_buf_l[i];
            dr = dry_buf_r[i];
            wl = ring_pop(&g_wet_ring[0]);
            wr = ring_pop(&g_wet_ring[1]);
        } else {
            dl = ring_pop(&g_dry_ring[0]);
            dr = ring_pop(&g_dry_ring[1]);

            while (g_out_phase >= 1.0) {
                g_out_hist[0][0] = g_out_hist[0][1];
                g_out_hist[0][1] = g_out_hist[0][2];
                g_out_hist[0][2] = g_out_hist[0][3];
                g_out_hist[0][3] = ring_pop(&g_wet_ring[0]);

                g_out_hist[1][0] = g_out_hist[1][1];
                g_out_hist[1][1] = g_out_hist[1][2];
                g_out_hist[1][2] = g_out_hist[1][3];
                g_out_hist[1][3] = ring_pop(&g_wet_ring[1]);

                g_out_phase -= 1.0;
            }
            float t = (float)g_out_phase;
            wl = hermite4(g_out_hist[0][0], g_out_hist[0][1], g_out_hist[0][2], g_out_hist[0][3], t);
            wr = hermite4(g_out_hist[1][0], g_out_hist[1][1], g_out_hist[1][2], g_out_hist[1][3], t);
            g_out_phase += g_out_step;
        }

        g_mix_cur = smooth_toward(g_mix_cur, g_mix_target, g_smooth_step);
        g_bypass_cur = smooth_toward(g_bypass_cur, g_bypass_target, g_smooth_step);
        g_out_gain_cur = smooth_toward(g_out_gain_cur, g_out_gain_target, g_smooth_step * 4.0f);
        if (g_switch_fade < 1.0f)
            g_switch_fade = smooth_toward(g_switch_fade, 1.0f, g_smooth_step * 0.65f);

        float eff_wet = g_mix_cur * (1.0f - g_bypass_cur) * g_switch_fade;
        float eff_dry = 1.0f - eff_wet;

        float yl = (dl * eff_dry + wl * eff_wet) * g_out_gain_cur;
        float yr = (dr * eff_dry + wr * eff_wet) * g_out_gain_cur;

        yl = sanitize_f32(yl);
        yr = sanitize_f32(yr);
        if (yl > 1.0f) yl = 1.0f;
        else if (yl < -1.0f) yl = -1.0f;
        if (yr > 1.0f) yr = 1.0f;
        else if (yr < -1.0f) yr = -1.0f;

        out_l[i] = yl;
        if (out_r)
            out_r[i] = yr;

        float aol = yl < 0.0f ? -yl : yl;
        float aor = yr < 0.0f ? -yr : yr;
        if (aol > g_peak_out_l) g_peak_out_l = aol;
        if (aor > g_peak_out_r) g_peak_out_r = aor;
    }
}

/* --- Buffer Pointers & Metering --- */
float *fx_get_in_l_ptr(void)  { return g_io_in_l; }
float *fx_get_in_r_ptr(void)  { return g_io_in_r; }
float *fx_get_out_l_ptr(void) { return g_io_out_l; }
float *fx_get_out_r_ptr(void) { return g_io_out_r; }

int fx_get_effect_count(void)      { return FX_ID_COUNT; }
int fx_get_native_sample_rate(void){ return FS; }
int fx_get_block_size(void)        { return CTL; }
int fx_get_host_sample_rate(void)  { return g_host_sr; }
int fx_get_latency_samples(void)   { return g_latency_samples; }
int fx_is_resampling(void)         { return g_resampling; }

int fx_get_state_bytes(int effect_id)
{
    if (effect_id == FX_ID_DELAY)  return (int)sizeof(dl_a) + (int)sizeof(dl);
    if (effect_id == FX_ID_REVERB) return (int)sizeof(rv_mem) + (int)sizeof(rv);
    int rm = fx_id_to_rm(effect_id);
    if (rm >= 0) return (int)rm_size((uint32_t)rm);
    int nx = fx_id_to_nx(effect_id);
    if (nx >= 0 && nx < NX_N) return (int)((nx_size((uint32_t)nx) + 7u) & ~7u);
    return 0;
}

float fx_get_peak_in_l(void)  { return g_peak_in_l; }
float fx_get_peak_in_r(void)  { return g_peak_in_r; }
float fx_get_peak_out_l(void) { return g_peak_out_l; }
float fx_get_peak_out_r(void) { return g_peak_out_r; }
void  fx_reset_peaks(void)
{
    g_peak_in_l = g_peak_in_r = 0.0f;
    g_peak_out_l = g_peak_out_r = 0.0f;
}

/* Live effect-specific internal state snapshot for visualization (read-only) */
int32_t *fx_get_telemetry_ptr(void) { return g_telemetry; }

void fx_update_telemetry(void)
{
    g_telemetry[0] = g_effect_id;
    g_telemetry[1] = g_guard[0].g;   /* Norilsk guard gain Q15 (0..32768) */
    g_telemetry[2] = g_guard[0].env; /* Guard peak envelope Q15 */
    g_telemetry[3] = 0;
    g_telemetry[4] = 0;
    g_telemetry[5] = 0;
    g_telemetry[6] = 0;
    g_telemetry[7] = (int32_t)rack_root;

    switch (g_effect_id) {
    case FX_ID_TAPE: {
        const m_tap_t *t = (const m_tap_t *)g_fx_slot[0];
        g_telemetry[3] = t->dg;
        g_telemetry[4] = t->drop;
        g_telemetry[5] = t->t >> 8;
        g_telemetry[6] = t->env;
        g_telemetry[7] = (int32_t)t->w;
        break;
    }
    case FX_ID_REVERSE: {
        const m_rvs_t *r = (const m_rvs_t *)g_fx_slot[0];
        g_telemetry[3] = (int32_t)(r->ph >> 16);
        g_telemetry[4] = (int32_t)((r->ph + 0x80000000u) >> 16);
        g_telemetry[5] = (int32_t)r->w;
        g_telemetry[6] = r->lp;
        g_telemetry[7] = (int32_t)RVS_N;
        break;
    }
    case FX_ID_GLITCH: {
        const m_glt_t *g = (const m_glt_t *)g_fx_slot[0];
        g_telemetry[3] = (int32_t)g->mask;
        g_telemetry[4] = g->back;
        g_telemetry[5] = (int32_t)g->loop_left;
        g_telemetry[6] = (int32_t)g->loop;
        g_telemetry[7] = (int32_t)g->w;
        break;
    }
    case FX_ID_CLOUD: {
        const m_cld_t *c = (const m_cld_t *)g_fx_slot[0];
        int32_t active = 0;
        for (uint32_t k = 0; k < CLD_G; k++) active += c->gon[k] ? 1 : 0;
        g_telemetry[3] = active;                                    /* 0..6 active grains */
        g_telemetry[4] = (g_params[2] >= 50 && c->filled >= CLD_N) ? 1 : 0; /* frozen flag */
        g_telemetry[5] = (int32_t)(c->filled * 100u / CLD_N);       /* fill % */
        g_telemetry[6] = (int32_t)c->w;                             /* write ptr */
        g_telemetry[7] = (int32_t)CLD_N;
        break;
    }
    case FX_ID_DELAY: {
        g_telemetry[3] = dl.t >> 8;                                 /* delay samples @ 22.05k */
        g_telemetry[4] = (int32_t)dl.w;                             /* write pointer 0..44099 */
        g_telemetry[5] = dl.lp;                                     /* damped feedback sample */
        g_telemetry[6] = dl_fb;                                     /* feedback Q15 */
        g_telemetry[7] = (int32_t)DL_N;
        break;
    }
    case FX_ID_REVERB: {
        g_telemetry[3] = rv.scale;                                  /* tank scale Q12 (2048..5120) */
        g_telemetry[4] = rv.decay;                                  /* tank decay Q15 */
        g_telemetry[5] = (int32_t)(rv.lfo >> 16);                   /* L modulation LFO 0..65535 */
        g_telemetry[6] = (int32_t)(rv.lfo2 >> 16);                  /* R modulation LFO 0..65535 */
        g_telemetry[7] = rv.damp;                                   /* damping Q15 */
        break;
    }
    case FX_ID_CHAOS: {
        const m_chs_t *c = (const m_chs_t *)g_fx_slot[0];
        g_telemetry[3] = c->x >> 9;                                 /* Duffing position (~-100k..100k) */
        g_telemetry[4] = c->v >> 9;                                 /* Duffing velocity */
        g_telemetry[5] = c->env;                                    /* input envelope */
        g_telemetry[6] = c->gate;                                   /* adaptive output gate */
        break;
    }
    case FX_ID_WAVESET: {
        const m_wst_t *w = (const m_wst_t *)g_fx_slot[0];
        g_telemetry[3] = w->mode;                                   /* 0..3 */
        g_telemetry[4] = (int32_t)w->len;                           /* active waveset len */
        g_telemetry[5] = w->dir;                                    /* +1 / -1 */
        g_telemetry[6] = w->omitted;                                /* omitted flag */
        break;
    }
    case FX_ID_LPG: {
        const nx_lpg_t *l = (const nx_lpg_t *)g_fx_slot[0];
        g_telemetry[3] = l->cv;                                     /* vactrol CV Q15 (0..32768) */
        g_telemetry[4] = l->ef;                                     /* fast env */
        g_telemetry[5] = l->es;                                     /* slow env */
        g_telemetry[6] = l->dec_now;                                /* drawn decay samples */
        break;
    }
    case FX_ID_STICK: {
        const nx_stick_t *k = (const nx_stick_t *)g_fx_slot[0];
        g_telemetry[3] = k->stuck;                                  /* 1=stuck, 0=slipping */
        g_telemetry[4] = k->pos >> 9;                               /* mass displacement Q15 */
        g_telemetry[5] = k->vel >> 8;                               /* mass velocity */
        g_telemetry[6] = k->env;
        break;
    }
    case FX_ID_DOPPLER: {
        const nx_doppler_t *d = (const nx_doppler_t *)g_fx_slot[0];
        g_telemetry[3] = (int32_t)(d->th >> 16);                    /* orbit angle 0..65535 */
        g_telemetry[4] = d->d16 >> 16;                              /* acoustic delay samples */
        g_telemetry[5] = d->g;                                      /* 1/d distance gain Q15 */
        g_telemetry[6] = d->lpk;                                    /* air absorption LP Q15 */
        break;
    }
    case FX_ID_GSM: {
        const nx_gsm_t *g = (const nx_gsm_t *)g_fx_slot[0];
        g_telemetry[3] = (int32_t)g->n;                             /* sample in 160-sample GSM frame */
        g_telemetry[4] = g->fac;                                    /* decimation factor 3..8 */
        g_telemetry[5] = (int32_t)g->fmax;                          /* frame peak */
        g_telemetry[6] = g->held;                                   /* decoded sample */
        break;
    }
    case FX_ID_SPIRAL: {
        const nx_spiral_t *sp = (const nx_spiral_t *)g_fx_slot[0];
        g_telemetry[3] = (int32_t)(sp->ph >> 16);                   /* pitch head A phase */
        g_telemetry[4] = (int32_t)((sp->ph + 0x80000000u) >> 16);   /* pitch head B phase */
        g_telemetry[5] = sp->t16 >> 16;                             /* delay samples */
        g_telemetry[6] = sp->win;                                   /* active window len */
        break;
    }
    case FX_ID_SUBHARM: {
        const nx_subharm_t *su = (const nx_subharm_t *)g_fx_slot[0];
        g_telemetry[3] = su->na;                                    /* divisor A */
        g_telemetry[4] = su->nb;                                    /* divisor B */
        g_telemetry[5] = su->sa > 0 ? 1 : 0;                        /* flip-flop A */
        g_telemetry[6] = su->sb > 0 ? 1 : 0;                        /* flip-flop B */
        break;
    }
    case FX_ID_STARVE: {
        const m_stv_t *sv = (const m_stv_t *)g_fx_slot[0];
        g_telemetry[3] = sv->open;                                  /* gate open 0/1 */
        g_telemetry[4] = sv->env;                                   /* envelope */
        break;
    }
    default:
        break;
    }
}

/* Compact metadata JSON embedded in WASM linear memory for runtime verification */
static const char FX_METADATA_JSON[] =
"{"
  "\"engine\":\"Molecular DSP (Full 46-Atom Q15 Core)\","
  "\"license\":\"GPL-3.0-only\","
  "\"nativeSampleRate\":44100,"
  "\"blockSize\":32,"
  "\"effectCount\":46,"
  "\"groups\":{\"norilsk\":25,\"tonitor\":2,\"molecular\":19},"
  "\"slugs\":["
    "\"tape\",\"reverse\",\"glitch\","
    "\"filter\",\"fold\",\"mulaw\",\"shift\",\"modal\",\"string\",\"vowel\",\"spring\","
    "\"cloud\",\"scream\",\"ring\",\"starve\",\"cheb\",\"bank\",\"smear\",\"diffuse\","
    "\"slew\",\"xor\",\"dust\",\"waveset\",\"xmod\",\"chaos\","
    "\"delay\",\"reverb\","
    "\"spiral\",\"source\",\"envel\",\"lpg\",\"barber\",\"stick\",\"morpho\",\"disintegrate\","
    "\"reed\",\"nlf\",\"subharm\",\"spark\",\"contrast\",\"blur\",\"doppler\",\"gsm\","
    "\"gendy\",\"invert\",\"squelch\""
  "]"
"}";

const char *fx_get_metadata_json(void) { return FX_METADATA_JSON; }
int fx_get_metadata_json_len(void)     { return (int)(sizeof(FX_METADATA_JSON) - 1u); }
