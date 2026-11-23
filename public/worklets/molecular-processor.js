/* SPDX-License-Identifier: GPL-3.0-only
 * Molecular FX Lab — AudioWorkletProcessor (Full 46-Effect Suite)
 *
 * Executes the compiled C99 Molecular DSP WebAssembly binary directly inside
 * the real-time AudioWorklet rendering thread with zero per-block allocations.
 */

class MolecularFxProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.memory = null;
    this.inLPtr = 0;
    this.inRPtr = 0;
    this.outLPtr = 0;
    this.outRPtr = 0;
    this.telemetryPtr = 0;
    this.inLView = null;
    this.inRView = null;
    this.outLView = null;
    this.outRView = null;
    this.telemetryView = null;
    this.ready = false;

    this.blocksProcessed = 0;
    this.telemetryCounter = 0;
    this.rmsInLSum = 0;
    this.rmsInRSum = 0;
    this.rmsOutLSum = 0;
    this.rmsOutRSum = 0;
    this.rmsSamples = 0;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg || typeof msg.type !== 'string') return;
      this.handleMessage(msg);
    };
  }

  async handleMessage(msg) {
    if (msg.type === 'init-wasm') {
      try {
        const result = await WebAssembly.instantiate(msg.wasmBytes, {});
        const ex = result.instance.exports;
        this.wasm = ex;
        this.memory = ex.memory;

        ex.fx_init(sampleRate, 128);
        this.inLPtr = ex.fx_get_in_l_ptr();
        this.inRPtr = ex.fx_get_in_r_ptr();
        this.outLPtr = ex.fx_get_out_l_ptr();
        this.outRPtr = ex.fx_get_out_r_ptr();
        this.telemetryPtr = ex.fx_get_telemetry_ptr();

        this.bindViews();

        // Decode embedded metadata JSON from WASM linear memory
        const metaPtr = ex.fx_get_metadata_json();
        const metaLen = ex.fx_get_metadata_json_len();
        const metaBytes = new Uint8Array(this.memory.buffer, metaPtr, metaLen);
        let metaStr = '';
        for (let i = 0; i < metaBytes.length; i++) {
          metaStr += String.fromCharCode(metaBytes[i]);
        }

        // Apply initial state if provided
        if (typeof msg.rootNote === 'number' && ex.fx_set_root_note) {
          ex.fx_set_root_note(msg.rootNote | 0);
        }
        if (typeof msg.effectId === 'number') ex.fx_select(msg.effectId | 0);
        if (Array.isArray(msg.params)) {
          for (let i = 0; i < 4 && i < msg.params.length; i++) {
            ex.fx_set_param(i, msg.params[i] | 0);
          }
        }
        if (typeof msg.mix === 'number') ex.fx_set_mix(msg.mix);
        if (typeof msg.bypass === 'boolean') ex.fx_set_bypass(msg.bypass ? 1 : 0);
        if (typeof msg.inputGain === 'number') ex.fx_set_input_gain(msg.inputGain);
        if (typeof msg.outputGain === 'number') ex.fx_set_output_gain(msg.outputGain);
        if (typeof msg.guard === 'boolean') ex.fx_set_guard_enabled(msg.guard ? 1 : 0);
        if (typeof msg.decorrelate === 'boolean') ex.fx_set_stereo_decorrelate(msg.decorrelate ? 1 : 0);

        this.ready = true;
        this.port.postMessage({
          type: 'wasm-ready',
          hostSampleRate: ex.fx_get_host_sample_rate(),
          nativeSampleRate: ex.fx_get_native_sample_rate(),
          blockSize: ex.fx_get_block_size(),
          latencySamples: ex.fx_get_latency_samples(),
          effectCount: ex.fx_get_effect_count ? ex.fx_get_effect_count() : 46,
          resampling: ex.fx_is_resampling() !== 0,
          metadataJson: metaStr,
        });
      } catch (err) {
        this.ready = false;
        this.port.postMessage({
          type: 'wasm-error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (!this.ready || !this.wasm) return;

    switch (msg.type) {
      case 'select':
        this.wasm.fx_select(msg.effectId | 0);
        if (Array.isArray(msg.params)) {
          for (let i = 0; i < 4 && i < msg.params.length; i++) {
            this.wasm.fx_set_param(i, msg.params[i] | 0);
          }
        }
        break;
      case 'param':
        this.wasm.fx_set_param(msg.index | 0, msg.value | 0);
        break;
      case 'rootNote':
        if (this.wasm.fx_set_root_note) {
          this.wasm.fx_set_root_note(msg.value | 0);
        }
        break;
      case 'mix':
        this.wasm.fx_set_mix(Number(msg.value));
        break;
      case 'bypass':
        this.wasm.fx_set_bypass(msg.value ? 1 : 0);
        break;
      case 'inputGain':
        this.wasm.fx_set_input_gain(Number(msg.value));
        break;
      case 'outputGain':
        this.wasm.fx_set_output_gain(Number(msg.value));
        break;
      case 'guard':
        this.wasm.fx_set_guard_enabled(msg.value ? 1 : 0);
        break;
      case 'decorrelate':
        this.wasm.fx_set_stereo_decorrelate(msg.value ? 1 : 0);
        break;
      case 'reset':
        this.wasm.fx_reset();
        break;
      default:
        break;
    }
  }

  bindViews() {
    const buf = this.memory.buffer;
    this.inLView = new Float32Array(buf, this.inLPtr, 1024);
    this.inRView = new Float32Array(buf, this.inRPtr, 1024);
    this.outLView = new Float32Array(buf, this.outLPtr, 1024);
    this.outRView = new Float32Array(buf, this.outRPtr, 1024);
    this.telemetryView = new Int32Array(buf, this.telemetryPtr, 8);
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outL = output[0];
    const outR = output.length > 1 ? output[1] : null;
    const n = outL.length;

    if (!this.ready || !this.wasm) {
      outL.fill(0);
      if (outR) outR.fill(0);
      return true;
    }

    if (this.inLView.buffer !== this.memory.buffer) {
      this.bindViews();
    }

    const input = inputs[0];
    const hasInL = input && input.length > 0 && input[0] && input[0].length === n;
    const hasInR = input && input.length > 1 && input[1] && input[1].length === n;

    const inLView = this.inLView;
    const inRView = this.inRView;

    if (hasInL) {
      const srcL = input[0];
      const srcR = hasInR ? input[1] : srcL;
      for (let i = 0; i < n; i++) {
        const vl = srcL[i];
        const vr = srcR[i];
        inLView[i] = vl;
        inRView[i] = vr;
        this.rmsInLSum += vl * vl;
        this.rmsInRSum += vr * vr;
      }
    } else {
      for (let i = 0; i < n; i++) {
        inLView[i] = 0;
        inRView[i] = 0;
      }
    }

    this.wasm.fx_process(this.inLPtr, this.inRPtr, this.outLPtr, this.outRPtr, n);

    const outLView = this.outLView;
    const outRView = this.outRView;
    for (let i = 0; i < n; i++) {
      const yl = outLView[i];
      const yr = outRView[i];
      outL[i] = yl;
      if (outR) outR[i] = yr;
      this.rmsOutLSum += yl * yl;
      this.rmsOutRSum += yr * yr;
    }

    this.rmsSamples += n;
    this.blocksProcessed += 1;
    this.telemetryCounter += 1;

    // Post meters & internal DSP telemetry at ~30 Hz (every 12 x 128-sample blocks)
    if (this.telemetryCounter >= 12) {
      this.telemetryCounter = 0;
      this.wasm.fx_update_telemetry();

      const inv = this.rmsSamples > 0 ? 1 / this.rmsSamples : 0;
      const rmsInL = Math.sqrt(this.rmsInLSum * inv);
      const rmsInR = Math.sqrt(this.rmsInRSum * inv);
      const rmsOutL = Math.sqrt(this.rmsOutLSum * inv);
      const rmsOutR = Math.sqrt(this.rmsOutRSum * inv);

      const peakInL = this.wasm.fx_get_peak_in_l();
      const peakInR = this.wasm.fx_get_peak_in_r();
      const peakOutL = this.wasm.fx_get_peak_out_l();
      const peakOutR = this.wasm.fx_get_peak_out_r();
      this.wasm.fx_reset_peaks();

      this.rmsInLSum = 0;
      this.rmsInRSum = 0;
      this.rmsOutLSum = 0;
      this.rmsOutRSum = 0;
      this.rmsSamples = 0;

      const t = this.telemetryView;
      this.port.postMessage({
        type: 'telemetry',
        peakInL,
        peakInR,
        peakOutL,
        peakOutR,
        rmsInL,
        rmsInR,
        rmsOutL,
        rmsOutR,
        blocksProcessed: this.blocksProcessed,
        latencySamples: this.wasm.fx_get_latency_samples(),
        dspState: [t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7]],
      });
    }

    return true;
  }
}

registerProcessor('molecular-fx-processor', MolecularFxProcessor);
