/* SPDX-License-Identifier: GPL-3.0-only
 * Molecular FX Lab — C99 External DSP Bridge Header (Full 46-Effect Suite)
 *
 * Wraps ALL 46 unmodified fixed-point (Q15) effect atoms from Molecular
 * (https://github.com/nzimas/molecular, GPL-3.0-only by Nuno Zimas):
 *   - 25 Norilsk effects (core/vendor/norilsk/effects.c)
 *   -  2 Tonitor heavy stereo effects (core/vendor/tonitor/delay.c, reverb.c)
 *   - 19 Molecular own atoms (core/atoms.c + core/gsm.c GSM 06.10 codec)
 */
#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Stable effect identifiers (IDs 0..2 preserved from MVP for compatibility) */
enum {
    /* MVP trio (Norilsk) */
    FX_ID_TAPE         = 0,
    FX_ID_REVERSE      = 1,
    FX_ID_GLITCH       = 2,

    /* Remaining 22 Norilsk effects (core/vendor/norilsk/effects.c) */
    FX_ID_FILTER       = 3,
    FX_ID_FOLD         = 4,
    FX_ID_MULAW        = 5,
    FX_ID_SHIFT        = 6,
    FX_ID_MODAL        = 7,
    FX_ID_STRING       = 8,
    FX_ID_VOWEL        = 9,
    FX_ID_SPRING       = 10,
    FX_ID_CLOUD        = 11,
    FX_ID_SCREAM       = 12,
    FX_ID_RING         = 13,
    FX_ID_STARVE       = 14,
    FX_ID_CHEB         = 15,
    FX_ID_BANK         = 16,
    FX_ID_SMEAR        = 17,
    FX_ID_DIFFUSE      = 18,
    FX_ID_SLEW         = 19,
    FX_ID_XOR          = 20,
    FX_ID_DUST         = 21,
    FX_ID_WAVESET      = 22,
    FX_ID_XMOD         = 23,
    FX_ID_CHAOS        = 24,

    /* 2 Tonitor heavy effects (core/vendor/tonitor/delay.c & reverb.c) */
    FX_ID_DELAY        = 25,
    FX_ID_REVERB       = 26,

    /* 19 Molecular own atoms (core/atoms.c + core/gsm.c) */
    FX_ID_SPIRAL       = 27,
    FX_ID_SOURCE       = 28,
    FX_ID_ENVEL        = 29,
    FX_ID_LPG          = 30,
    FX_ID_BARBER       = 31,
    FX_ID_STICK        = 32,
    FX_ID_MORPHO       = 33,
    FX_ID_DISINTEGRATE = 34,
    FX_ID_REED         = 35,
    FX_ID_NLF          = 36,
    FX_ID_SUBHARM      = 37,
    FX_ID_SPARK        = 38,
    FX_ID_CONTRAST     = 39,
    FX_ID_BLUR         = 40,
    FX_ID_DOPPLER      = 41,
    FX_ID_GSM          = 42,
    FX_ID_GENDY        = 43,
    FX_ID_INVERT       = 44,
    FX_ID_SQUELCH      = 45,

    FX_ID_COUNT        = 46
};

/* Maximum AudioWorklet / host render block size supported by static I/O buffers */
#define FX_MAX_IO_FRAMES 1024

/* Lifecycle & configuration */
int   fx_init(int host_sample_rate, int max_block_frames);
void  fx_destroy(void);
int   fx_select(int effect_id);
int   fx_get_selected(void);
void  fx_set_param(int param_index, int value_0_100);
int   fx_get_param(int param_index);
void  fx_set_root_note(int midi_note);
int   fx_get_root_note(void);
void  fx_set_mix(float dry_wet_0_1);
void  fx_set_bypass(int bypassed);
void  fx_set_input_gain(float gain_linear);
void  fx_set_output_gain(float gain_linear);
void  fx_set_guard_enabled(int enabled);
void  fx_set_stereo_decorrelate(int enabled);
void  fx_reset(void);

/* Real-time float32 stereo processing (zero dynamic allocation) */
void  fx_process(const float *in_l, const float *in_r,
                 float *out_l, float *out_r,
                 int num_frames);

/* Direct 32-sample Q15 block entrypoint (for bit-exact native vs WASM parity tests) */
void  fx_process_q15_block_raw(int effect_id, const int32_t *in32, int32_t *out32, int use_guard);

/* Static I/O buffer pointers in linear memory (avoids per-block allocations in AudioWorklet) */
float *fx_get_in_l_ptr(void);
float *fx_get_in_r_ptr(void);
float *fx_get_out_l_ptr(void);
float *fx_get_out_r_ptr(void);

/* Metadata & runtime inspection */
int         fx_get_effect_count(void);
int         fx_get_state_bytes(int effect_id);
const char *fx_get_metadata_json(void);
int         fx_get_metadata_json_len(void);
int         fx_get_native_sample_rate(void);
int         fx_get_block_size(void);
int         fx_get_host_sample_rate(void);
int         fx_get_latency_samples(void);
int         fx_is_resampling(void);

/* Metering & effect-specific live telemetry */
float fx_get_peak_in_l(void);
float fx_get_peak_in_r(void);
float fx_get_peak_out_l(void);
float fx_get_peak_out_r(void);
void  fx_reset_peaks(void);

/* Writes 8 int32 telemetry values into a pre-allocated buffer (see fx_get_telemetry_ptr) */
int32_t *fx_get_telemetry_ptr(void);
void     fx_update_telemetry(void);

#ifdef __cplusplus
}
#endif
