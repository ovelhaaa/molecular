#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Molecular FX Lab — Native C99 vs WebAssembly Bit-Exact Parity Test (All 46 Effects)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const WASM_PATH = path.join(ROOT, 'public/wasm/molecular-fx.wasm');

const FX_SLUGS = [
  'tape', 'reverse', 'glitch',
  'filter', 'fold', 'mulaw', 'shift', 'modal', 'string', 'vowel', 'spring',
  'cloud', 'scream', 'ring', 'starve', 'cheb', 'bank', 'smear', 'diffuse',
  'slew', 'xor', 'dust', 'waveset', 'xmod', 'chaos',
  'delay', 'reverb',
  'spiral', 'source', 'envel', 'lpg', 'barber', 'stick', 'morpho', 'disintegrate',
  'reed', 'nlf', 'subharm', 'spark', 'contrast', 'blur', 'doppler', 'gsm',
  'gendy', 'invert', 'squelch',
];

let fails = 0;
function expect(cond, msg) {
  if (!cond) {
    fails++;
    console.error('FAIL:', msg);
  }
}

function generateTestSignal(frames, sr) {
  const l = new Float32Array(frames);
  const r = new Float32Array(frames);
  const freqs = [220.0, 277.1826, 329.6276, 440.0];
  for (let i = 0; i < frames; i++) {
    const t = i / sr;
    const beatT = t % 0.20;
    const env = 0.25 + 0.75 * Math.exp(-beatT * 14.0);
    const step = Math.floor(t / 0.20) % 4;
    const f0 = freqs[step];
    const f1 = f0 * 1.5;
    let sl = (0.45 * Math.sin(2.0 * Math.PI * f0 * t) + 0.20 * Math.sin(2.0 * Math.PI * 2.0 * f0 * t)) * env;
    let srVal = (0.45 * Math.sin(2.0 * Math.PI * f1 * t) + 0.15 * Math.sin(2.0 * Math.PI * 3.0 * f0 * t)) * env;
    if (i === 64) {
      sl += 0.35;
      srVal += 0.35;
    }
    l[i] = Math.fround(sl);
    r[i] = Math.fround(srVal);
  }
  return { l, r };
}

async function main() {
  console.log(`=== Molecular FX Lab: WASM vs Native Parity Verification (All ${FX_SLUGS.length} Effects) ===`);
  const wasmBytes = fs.readFileSync(WASM_PATH);
  const mod = await WebAssembly.compile(wasmBytes);

  // Verify zero external imports (essential for pure AudioWorklet execution)
  const imports = WebAssembly.Module.imports(mod);
  console.log(`WASM size: ${(wasmBytes.length / 1024).toFixed(1)} KiB | External imports: ${imports.length}`);
  if (imports.length > 0) console.log('  Imports:', imports);
  expect(imports.length === 0, `Expected 0 external WASM imports, found ${imports.length}`);

  const instance = await WebAssembly.instantiate(mod, {});
  const ex = instance.exports;
  const mem = ex.memory;

  // Verify metadata JSON directly from WASM linear memory
  const metaPtr = ex.fx_get_metadata_json();
  const metaLen = ex.fx_get_metadata_json_len();
  const metaJson = new TextDecoder().decode(new Uint8Array(mem.buffer, metaPtr, metaLen));
  const meta = JSON.parse(metaJson);
  expect(meta.nativeSampleRate === 44100 && meta.blockSize === 32, 'Unexpected metadata sample rate / block size');
  expect(meta.effectCount === 46 && ex.fx_get_effect_count() === 46, `Expected 46 effects, got ${ex.fx_get_effect_count()}`);
  expect(meta.slugs.length === 46, 'Metadata slugs count mismatch');

  // 1. Raw Q15 32-sample block parity across ALL 46 effects (MUST BE BIT-EXACT: 0 LSB difference!)
  const nblocks = 1024;
  const nsamples = nblocks * 32;
  const inQ15 = new Int32Array(nsamples);
  for (let i = 0; i < nsamples; i++) {
    const saw = ((i * 317) % 28000) - 14000;
    const sq = ((Math.floor(i / 67)) & 1) ? 9000 : -9000;
    const active = i < 24576 ? 1 : 0;
    const imp = (i === 32 || i === 1024 || i === 8192) ? 18000 : 0;
    let v = active ? Math.trunc((saw + sq) / 2) : 0;
    v += imp;
    if (v > 30000) v = 30000;
    if (v < -30000) v = -30000;
    inQ15[i] = v;
  }

  const q15RefBuf = fs.readFileSync(path.join(ROOT, 'build/dsp_ref_q15_all46.bin'));
  const q15RefAll = new Int32Array(q15RefBuf.buffer, q15RefBuf.byteOffset, FX_SLUGS.length * nsamples);

  const qInPtr = ex.fx_get_in_l_ptr();
  const qOutPtr = ex.fx_get_out_l_ptr();
  const wasmIn32 = new Int32Array(mem.buffer, qInPtr, 32);
  const wasmOut32 = new Int32Array(mem.buffer, qOutPtr, 32);

  let worstQ15Lsb = 0;
  let totalQ15Mismatches = 0;
  for (let fx = 0; fx < FX_SLUGS.length; fx++) {
    const refOffset = fx * nsamples;
    ex.fx_init(44100, 128);
    ex.fx_select(fx);
    ex.fx_reset();

    let maxDiff = 0;
    let mismatches = 0;
    for (let b = 0; b < nblocks; b++) {
      wasmIn32.set(inQ15.subarray(b * 32, b * 32 + 32));
      ex.fx_process_q15_block_raw(fx, qInPtr, qOutPtr, 1);
      for (let k = 0; k < 32; k++) {
        const diff = Math.abs(wasmOut32[k] - q15RefAll[refOffset + b * 32 + k]);
        if (diff > maxDiff) maxDiff = diff;
        if (diff !== 0) mismatches++;
      }
    }
    if (maxDiff > worstQ15Lsb) worstQ15Lsb = maxDiff;
    totalQ15Mismatches += mismatches;
    expect(maxDiff === 0, `Q15 raw [${fx}] ${FX_SLUGS[fx]} differed from native! maxDiff=${maxDiff}, mismatches=${mismatches}`);
  }
  console.log(
    `  [Q15 Parity] All ${FX_SLUGS.length}/46 effects: max_lsb_diff=${worstQ15Lsb}  total_mismatches=${totalQ15Mismatches}/${FX_SLUGS.length * nsamples}`
  );

  // 2. Float32 stereo parity at 44.1 kHz and 48.0 kHz across ALL 46 effects
  const inLPtr = ex.fx_get_in_l_ptr();
  const inRPtr = ex.fx_get_in_r_ptr();
  const outLPtr = ex.fx_get_out_l_ptr();
  const outRPtr = ex.fx_get_out_r_ptr();
  const wInL = new Float32Array(mem.buffer, inLPtr, 1024);
  const wInR = new Float32Array(mem.buffer, inRPtr, 1024);
  const wOutL = new Float32Array(mem.buffer, outLPtr, 1024);
  const wOutR = new Float32Array(mem.buffer, outRPtr, 1024);

  for (const sr of [44100, 48000]) {
    const frames = sr === 44100 ? 22016 : 24064;
    const chunk = 128;
    const sig = generateTestSignal(frames, sr);
    const refBuf = fs.readFileSync(path.join(ROOT, `build/dsp_ref_f32_${sr}_all46.bin`));
    const refAll = new Float32Array(refBuf.buffer, refBuf.byteOffset, FX_SLUGS.length * frames * 2);

    let worstMaxDiff = 0;
    let worstSlug = '';
    let sumRmsSq = 0;
    const tol = sr === 44100 ? 1e-5 : 1e-4;

    for (let fx = 0; fx < FX_SLUGS.length; fx++) {
      const refBase = fx * frames * 2;
      ex.fx_init(sr, chunk);
      ex.fx_select(fx);
      ex.fx_set_mix(0.80);
      ex.fx_set_bypass(0);
      ex.fx_set_input_gain(1.0);
      ex.fx_set_output_gain(1.0);
      ex.fx_reset();

      let fxMaxDiff = 0;
      for (let off = 0; off < frames; off += chunk) {
        const n = Math.min(chunk, frames - off);
        wInL.set(sig.l.subarray(off, off + n));
        wInR.set(sig.r.subarray(off, off + n));
        ex.fx_process(inLPtr, inRPtr, outLPtr, outRPtr, n);
        for (let k = 0; k < n; k++) {
          const i = off + k;
          const dl = Math.abs(wOutL[k] - refAll[refBase + i * 2]);
          const dr = Math.abs(wOutR[k] - refAll[refBase + i * 2 + 1]);
          if (dl > fxMaxDiff) fxMaxDiff = dl;
          if (dr > fxMaxDiff) fxMaxDiff = dr;
          sumRmsSq += dl * dl + dr * dr;
        }
      }

      if (fxMaxDiff > worstMaxDiff) {
        worstMaxDiff = fxMaxDiff;
        worstSlug = FX_SLUGS[fx];
      }
      expect(fxMaxDiff <= tol, `F32 ${sr} Hz [${fx}] ${FX_SLUGS[fx]} maxDiff=${fxMaxDiff} > tol=${tol}`);
    }

    const avgRms = Math.sqrt(sumRmsSq / (FX_SLUGS.length * frames * 2));
    console.log(
      `  [F32 ${String(sr).padStart(5)} Hz Parity] All ${FX_SLUGS.length}/46 effects: worst_max_diff=${worstMaxDiff.toExponential(2)} (${worstSlug || 'none'})  overall_rms_diff=${avgRms.toExponential(2)}  (tol ${tol.toExponential(0)})`
    );
  }

  if (fails > 0) {
    console.error(`FAILED: ${fails} WASM parity check(s) failed`);
    process.exit(1);
  }
  console.log('WASM vs Native C99 DSP Parity (46/46 effects): ALL PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
