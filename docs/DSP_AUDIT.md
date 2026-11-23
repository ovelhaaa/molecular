# Molecular FX Lab — DSP Architecture & Code Audit

This document records the technical audit of the upstream **Molecular** firmware (`https://github.com/nzimas/molecular`, GPL-3.0-only, by Nuno Zimas) conducted prior to WebAssembly porting.

## 1. Upstream Integration Architecture

- **Compilation unit**: `core/molecular.c` is a single-translation-unit C99 build. Defining `HOST=1` strips target-specific linker attributes (`POOL`, `FAST`, `DLYMEM`, `TABLE_FAST`) used on the MVsilicon BP1048B1 / Andes NDS32 MCU.
- **Lookup tables**: `tools/gen_tables.py` generates `tonitor_tables.h` containing:
  - `FS = 44100` Hz (fixed DSP sample rate)
  - `CTL = 32` samples per control/audio block (`1378.125` blocks/s, ~0.726 ms/block)
  - `SINE[1025]`, `PITCH_OCT[192]`, `EXP2_FRAC[257]`, `LOG2_FRAC[257]`, `TANH_Q15[513]`, `TAN_G[513]` (`TANG_FMAX = 19845`), `MULAW_ENC[2048]`, `MULAW_DEC[128]`.
- **Numeric format (`core/vendor/tonitor/dsp.h`)**:
  - Fixed-point integer Q15 samples in `int32_t` (`Q15 = 32768 = 1.0`, with headroom above full scale inside filters/mixers).
  - No floating-point instructions in the DSP inner loops; 64-bit intermediate products (`mulq15`, `mulz15`, `mulq12`).
  - Helper functions provided by `core/molecular.c` for Norilsk effects: `gr_enc`/`gr_dec` (8-bit μ-law), `LV(x)`, `mulz15`, `mini`, `ms_samples2` (`ms * 2205 / 100`, half-rate 22,050 Hz samples), `ms_blocks` (`(ms * 1411) >> 10`).
- **Output guard (`core/fx.c`)**:
  - `fx_guard(fx_state_t *s, int32_t *x)` runs after every inner atom block: an instant-attack, ~200 ms-release peak rider targeting half scale (`16384` Q15) with final hard clamp to `[-Q15, Q15]`.

## 2. Shared Resources vs. Independent Multi-Instance Effects

| Category | Effects | Source File | State Storage | Multi-Instance Safe? | Notes |
| --- | --- | --- | --- | --- | --- |
| Norilsk 25 Effects | `FILTER`, `FOLD`, `MULAW`, `SHIFT`, `MODAL`, `STRING`, `VOWEL`, **`TAPE`**, **`REVERSE`**, `SPRING`, **`GLITCH`**, `CLOUD`, `SCREAM`, `RING`, `STARVE`, `CHEB`, `BANK`, `SMEAR`, `DIFFUSE`, `SLEW`, `XOR`, `DUST`, `WAVESET`, `XMOD`, `CHAOS` | `core/vendor/norilsk/effects.c` | Caller-owned struct (`m_*_t`) | **Yes** (independent L/R stereo pairs) | `MODAL`, `STRING`, `BANK` read shared `rack_root` (default MIDI 48). `GLITCH` & `CLOUD` seed PRNG via `fx_place(st)`. |
| Molecular Own 19 Atoms | `SPIRAL`, `SOURCE`, `ENVEL`, `LPG`, `BARBER`, `STICK`, `MORPHO`, `DISINTEGRATE`, `REED`, `NLF`, `SUBHARM`, `SPARK`, `CONTRAST`, `BLUR`, `DOPPLER`, `GSM`, `GENDY`, `INVERT`, `SQUELCH` | `core/atoms.c` (+ `core/gsm.c`) | Caller-owned struct (`nx_*_t`) | **Yes** (except `GSM` wraps vendor codec state inside struct) | `SOURCE` and `REED` read `rack_root`. |
| Tonitor Heavy Atoms | `DELAY` (`dl_block`), `REVERB` (`rv_block`) | `core/vendor/tonitor/delay.c`, `reverb.c` | Static globals (`dl_a[44100]`, `dl`, `rv_mem[21600]`, `rv`) | **No** (singletons without refactoring) | Mono-in, stereo-out; run at `FS / 2` (22,050 Hz). |

## 3. MVP Feasibility & Parameter Table

All three requested MVP effects belong to `core/vendor/norilsk/effects.c`, have **zero global mutable state**, require **no FM synthesis or molecule graph**, and compile unchanged into standalone WebAssembly via Emscripten.

| Effect | Upstream Function & Struct | State Size (per ch) | Internal Rate & Storage | Parameters (`p[0..3]`, 0–100) | Defaults (`RM_HOME`) | Draw Bounds (`RM_LO..HI`) | Portability |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **TAPE** (`Ta`, `AT_TAPE` / `RM_TAP`) | `m_tap`, `m_tap_t` | ~19,952 B (`TAP_N = 19900`) | 22,050 Hz (`FS/2`), 8-bit μ-law, pair avg + linear interp | `p0` TIME: `25..900 ms` linear (23 ms crossfade, ±0.1% thermal breath)<br>`p1` DROPOUTS: `0..100%` (up to ~2/s, 20–200 ms, 3 ms smooth edge)<br>`p2` FEEDBACK: `0..0.94` Q15 through head `tanh`<br>`p3` AGE: LP `~12..3 kHz`, head drive `1.5x..4x`, gated hiss up to `-40 dB` | `{50, 30, 45, 40}` | `p0: 10..100`<br>`p1: 0..100`<br>`p2: 0..90`<br>`p3: 0..85` | **Ready (WASM + Native verified)** |
| **REVERSE** (`Rs`, `AT_REVERSE` / `RM_RVS`) | `m_rvs`, `m_rvs_t` | ~19,864 B (`RVS_N = 19845`) | 22,050 Hz (`FS/2`), 8-bit μ-law, dual 180° triangle-windowed heads | `p0` WINDOW: `60..220 ms` reverse grain window<br>`p1` TONE: `~1.4..13 kHz` one-pole LP (`6400..31000` Q15)<br>`p2` FEEDBACK: `0..70%` (`LV(0.7)`) smeared reverse loop<br>`p3` SPREAD: `0..200%` of window reach back (`1x..3x` total) | `{40, 60, 30, 50}` | `p0: 0..100`<br>`p1: 30..100`<br>`p2: 0..80`<br>`p3: 0..100` | **Ready (WASM + Native verified)** |
| **GLITCH** (`Gl`, `AT_GLITCH` / `RM_GLT`) | `m_glt`, `m_glt_t` | ~16,448 B (`GLT_N = 16384`) | 22,050 Hz (`FS/2`), 8-bit μ-law ring with XOR address bit-bending | `p0` BEND: `0..100%` chance & bit reach (`bit 4..13`)<br>`p1` CLOCK: `0.5..16.0 Hz` event clock<br>`p2` STUTTER: `0..100%` chance of 10–120 ms loop (2–6 rounds)<br>`p3` SPAN: `20..700 ms` read-behind span (2 ms crossfade) | `{50, 40, 35, 45}` | `p0: 15..100`<br>`p1: 0..90`<br>`p2: 0..85`<br>`p3: 0..100` | **Ready (WASM + Native verified)** |

## 4. External Processing Mode & Real-Time Constraints

- **Bridge wrapper (`dsp/bridge/molecular_fx_bridge.c`)**:
  - Includes unmodified upstream `tonitor_tables.h`, `core/vendor/tonitor/dsp.h`, `core/vendor/tonitor/reverb.c`, `core/vendor/tonitor/delay.c`, `core/vendor/norilsk/tables.h`, `core/vendor/norilsk/effects.c`, `core/gsm.c` (with `core/vendor/gsm/`), and `core/atoms.c` in exact `core/molecular.c` order.
  - Runs two independent channel slots (Left & Right, `FX_SLOT_BYTES = 24,576 B` each, verified via `_Static_assert` against every `m_*_t` and `nx_*_t`) in static BSS memory — zero heap allocation during `fx_process()`.
  - Routes `DELAY` (ID 25, 44,116 B) and `REVERB` (ID 26, 43,452 B) in true-stereo mode via `dl_block` / `rv_block` with cached parameter cooking (`dl_param` / `rv_param`).
  - Primes `CHAOS` (ID 24) with 1 silent `CTL=32` block on reset/select, verbatim from `core/fx.c`.
  - Exposes `fx_set_root_note(midi)` (`rack_root`, MIDI 24–84, default C3 = 48) for pitched resonators (`MODAL`, `STRING`, `BANK`, `SOURCE`, `REED`).
  - Adapts AudioWorklet 128-frame blocks to Molecular's `CTL = 32` blocks cleanly:
    - At `44,100 Hz`: exact 4 × `CTL` execution per 128-frame quantum with **0 samples** of adapter latency.
    - At other host sample rates (e.g. `48,000 Hz`, `96,000 Hz`): 4-point Catmull-Rom cubic Hermite resampler converts `host_sr → 44,100 Hz → CTL=32 Q15 DSP → host_sr` with a 64-sample FIFO (~1.45 ms) and phase-aligned dry delay buffer.
  - Per-sample smoothed input gain, output gain, dry/wet mix, click-free bypass ramp (~5 ms), click-free effect-switch ramp (~8 ms), NaN/Inf/denormal sanitization, and optional `fx_guard` output protection.

## 5. Full 46-Atom Implementation & CI Verification

All **46** Molecular effects are compiled into a single standalone WebAssembly binary (`public/wasm/molecular-fx.wasm`):

- **25 Norilsk effects** (`ID 0..24`): `TAPE`, `REVERSE`, `GLITCH`, `FILTER`, `FOLD`, `MULAW`, `SHIFT`, `MODAL`, `STRING`, `VOWEL`, `SPRING`, `CLOUD`, `SCREAM`, `RING`, `STARVE`, `CHEB`, `BANK`, `SMEAR`, `DIFFUSE`, `SLEW`, `XOR`, `DUST`, `WAVESET`, `XMOD`, `CHAOS`.
- **2 Tonitor heavy stereo effects** (`ID 25..26`): `DELAY`, `REVERB`.
- **19 Molecular own atoms** (`ID 27..45`): `SPIRAL`, `SOURCE`, `ENVEL`, `LPG`, `BARBER`, `STICK`, `MORPHO`, `DISINTEGRATE`, `REED`, `NLF`, `SUBHARM`, `SPARK`, `CONTRAST`, `BLUR`, `DOPPLER`, `GSM`, `GENDY`, `INVERT`, `SQUELCH`.

### Verified Build & Parity Results

- **WASM Binary Size**: `113.8 KiB` (`116,569` bytes) with **0 external WASM imports** (`STANDALONE_WASM=1 --no-entry`, 2 MiB fixed linear memory, zero runtime malloc).
- **Q15 Bit-Exact Parity (Native C99 vs WASM)**: **46/46 effects passed** with `max_lsb_diff = 0` (`0 / 1,507,328` sample mismatches).
- **Float32 Stereo Parity (44.1 kHz & 48 kHz)**: **46/46 effects passed** with `worst_max_diff = 0.00e+0`.
- **GitHub Actions CI (`.github/workflows/build-wasm.yml`)**: Automatically builds upstream `./build/host`, compiles `public/wasm/molecular-fx.wasm` with Emscripten `3.1.56`, runs `scripts/test-dsp.sh` (46-effect parity), typechecks and builds the Vite web app, writes a Job Summary table, and uploads `molecular-fx-wasm` and `molecular-fx-lab-dist` artifacts.

