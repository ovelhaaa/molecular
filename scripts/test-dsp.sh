#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Runs the complete Native C99 + Emscripten WASM DSP parity validation suite.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p build

echo "[1/4] Generating lookup tables..."
python3 -I tools/gen_tables.py build/tonitor_tables.h >/dev/null

echo "[2/4] Compiling & running Native C99 bridge tests..."
gcc -std=gnu99 -O2 -DHOST=1 \
  -Wall -Wextra -Wno-unused-function -Wno-unused-parameter -Wno-sign-compare \
  -Ibuild -Icore -Idsp/bridge \
  dsp/tests/test_native.c dsp/bridge/molecular_fx_bridge.c \
  -o build/test_native_bridge -lm
./build/test_native_bridge

echo "[3/4] Ensuring WASM binary is built..."
if [ ! -f public/wasm/molecular-fx.wasm ]; then
  bash scripts/build-wasm.sh
fi

echo "[4/4] Running WebAssembly vs Native parity test..."
node dsp/tests/test_wasm_parity.mjs
