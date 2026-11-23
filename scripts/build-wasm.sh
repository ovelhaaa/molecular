#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Reproducible Emscripten build for Molecular FX Lab WebAssembly DSP engine (all 46 effects).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p build public/wasm

echo "[1/3] Generating fixed-point lookup tables via tools/gen_tables.py..."
python3 -I tools/gen_tables.py build/tonitor_tables.h

if ! command -v emcc >/dev/null 2>&1; then
  echo "ERROR: emcc (Emscripten) was not found in PATH." >&2
  echo "Install Emscripten (https://emscripten.org) or run the GitHub Actions workflow." >&2
  exit 1
fi

echo "[2/3] Compiling dsp/bridge/molecular_fx_bridge.c (46 Molecular effects) -> public/wasm/molecular-fx.wasm ($(emcc --version | head -n 1))..."

EXPORTS='[
  "_fx_init",
  "_fx_destroy",
  "_fx_select",
  "_fx_get_selected",
  "_fx_set_param",
  "_fx_get_param",
  "_fx_set_root_note",
  "_fx_get_root_note",
  "_fx_set_mix",
  "_fx_set_bypass",
  "_fx_set_input_gain",
  "_fx_set_output_gain",
  "_fx_set_guard_enabled",
  "_fx_set_stereo_decorrelate",
  "_fx_reset",
  "_fx_process",
  "_fx_process_q15_block_raw",
  "_fx_get_in_l_ptr",
  "_fx_get_in_r_ptr",
  "_fx_get_out_l_ptr",
  "_fx_get_out_r_ptr",
  "_fx_get_effect_count",
  "_fx_get_state_bytes",
  "_fx_get_metadata_json",
  "_fx_get_metadata_json_len",
  "_fx_get_native_sample_rate",
  "_fx_get_block_size",
  "_fx_get_host_sample_rate",
  "_fx_get_latency_samples",
  "_fx_is_resampling",
  "_fx_get_peak_in_l",
  "_fx_get_peak_in_r",
  "_fx_get_peak_out_l",
  "_fx_get_peak_out_r",
  "_fx_reset_peaks",
  "_fx_get_telemetry_ptr",
  "_fx_update_telemetry"
]'

emcc \
  -std=gnu99 \
  -O3 \
  -DHOST=1 \
  -Wall -Wextra -Wno-unused-function -Wno-unused-parameter -Wno-sign-compare \
  -Ibuild -Icore -Idsp/bridge \
  dsp/bridge/molecular_fx_bridge.c \
  -s STANDALONE_WASM=1 \
  --no-entry \
  -s INITIAL_MEMORY=2097152 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s TOTAL_STACK=131072 \
  -s EXPORTED_FUNCTIONS="$EXPORTS" \
  -o public/wasm/molecular-fx.wasm

echo "[3/3] Build complete:"
ls -lh public/wasm/molecular-fx.wasm
