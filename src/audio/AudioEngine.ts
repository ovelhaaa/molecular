/* SPDX-License-Identifier: GPL-3.0-only
 * Molecular FX Lab — Real-Time Web Audio + AudioWorklet + WASM Engine (46 Effects)
 *
 * Strictly executes the Emscripten-compiled C99 WASM module inside an AudioWorklet.
 * Never falls back to fake JavaScript DSP approximations.
 */

import { type EffectId, getEffectMeta } from '../effects/catalog';
import { type BuiltinClipId, buildTestAudioBuffer, encodeWavStereo } from './testSignals';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SourceMode = 'file' | 'live';

export interface TelemetryFrame {
  peakInL: number;
  peakInR: number;
  peakOutL: number;
  peakOutR: number;
  rmsInL: number;
  rmsInR: number;
  rmsOutL: number;
  rmsOutR: number;
  blocksProcessed: number;
  latencySamples: number;
  dspState: [number, number, number, number, number, number, number, number];
}

export interface EngineInfo {
  status: EngineStatus;
  errorMessage: string | null;
  hostSampleRate: number;
  nativeSampleRate: number;
  blockSize: number;
  latencySamples: number;
  baseLatencyMs: number;
  effectCount: number;
  resampling: boolean;
  wasmBytesSize: number;
  workletState: 'uninitialized' | 'loading' | 'running' | 'error';
}

export interface LoadedClipInfo {
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
  peaks: Float32Array;
}

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  if (gain <= 1e-5) return -96;
  return 20 * Math.log10(gain);
}

function computeOverviewPeaks(buffer: AudioBuffer, buckets = 240): Float32Array {
  const out = new Float32Array(buckets);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const step = Math.max(1, Math.floor(buffer.length / buckets));

  for (let b = 0; b < buckets; b++) {
    const start = b * step;
    const end = Math.min(buffer.length, start + step);
    let pk = 0;
    for (let i = start; i < end; i++) {
      const v = Math.max(Math.abs(ch0[i]), Math.abs(ch1[i]));
      if (v > pk) pk = v;
    }
    out[b] = pk;
  }
  return out;
}

export class MolecularAudioEngine {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private inputBus: GainNode | null = null;
  private preAnalyser: AnalyserNode | null = null;
  private postAnalyser: AnalyserNode | null = null;

  private fileSource: AudioBufferSourceNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private liveStream: MediaStream | null = null;
  private liveSource: MediaStreamAudioSourceNode | null = null;

  private wasmBytesCache: ArrayBuffer | null = null;

  // Transport state
  private isPlaying = false;
  private loop = true;
  private startCtxTime = 0;
  private pauseOffset = 0;
  private sourceMode: SourceMode = 'file';
  private liveActive = false;

  // Current DSP state mirrored for init/export
  private effectId: EffectId = 0;
  private params: [number, number, number, number] = [50, 30, 45, 40];
  private rootNote = 48; // MIDI C3
  private mix = 0.65;
  private bypass = false;
  private inputGainDb = 0;
  private outputGainDb = 0;
  private guardEnabled = true;
  private stereoDecorrelate = false;

  private info: EngineInfo = {
    status: 'idle',
    errorMessage: null,
    hostSampleRate: 0,
    nativeSampleRate: 44100,
    blockSize: 32,
    latencySamples: 0,
    baseLatencyMs: 0,
    effectCount: 46,
    resampling: false,
    wasmBytesSize: 0,
    workletState: 'uninitialized',
  };

  private onInfoChange: ((info: EngineInfo) => void) | null = null;
  private onTelemetry: ((t: TelemetryFrame) => void) | null = null;
  private onTransportEnd: (() => void) | null = null;

  setCallbacks(callbacks: {
    onInfoChange?: (info: EngineInfo) => void;
    onTelemetry?: (t: TelemetryFrame) => void;
    onTransportEnd?: () => void;
  }) {
    this.onInfoChange = callbacks.onInfoChange ?? null;
    this.onTelemetry = callbacks.onTelemetry ?? null;
    this.onTransportEnd = callbacks.onTransportEnd ?? null;
  }

  getInfo(): EngineInfo {
    return { ...this.info };
  }

  getAnalysers(): { pre: AnalyserNode | null; post: AnalyserNode | null } {
    return { pre: this.preAnalyser, post: this.postAnalyser };
  }

  private emitInfo(patch: Partial<EngineInfo>) {
    this.info = { ...this.info, ...patch };
    this.onInfoChange?.(this.getInfo());
  }

  async ensureInitialized(): Promise<boolean> {
    if (this.info.status === 'ready' && this.ctx && this.workletNode) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return true;
    }

    if (this.info.status === 'loading') {
      return false;
    }

    this.emitInfo({
      status: 'loading',
      workletState: 'loading',
      errorMessage: null,
    });

    try {
      const resp = await fetch('/wasm/molecular-fx.wasm', { cache: 'no-cache' });
      if (!resp.ok) {
        throw new Error(
          `Failed to load /wasm/molecular-fx.wasm (HTTP ${resp.status}). Run "npm run build:wasm" to compile the Emscripten DSP engine.`
        );
      }
      const wasmBuf = await resp.arrayBuffer();
      if (wasmBuf.byteLength < 1024) {
        throw new Error('WASM binary appears empty or truncated.');
      }
      this.wasmBytesCache = wasmBuf.slice(0);

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx({ latencyHint: 'interactive' });
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      this.ctx = ctx;

      if (!ctx.audioWorklet) {
        throw new Error('AudioWorklet is not supported in this browser context (HTTPS or localhost required).');
      }

      await ctx.audioWorklet.addModule('/worklets/molecular-processor.js');

      const inputBus = ctx.createGain();
      const preAnalyser = ctx.createAnalyser();
      preAnalyser.fftSize = 2048;
      preAnalyser.smoothingTimeConstant = 0.72;

      const postAnalyser = ctx.createAnalyser();
      postAnalyser.fftSize = 2048;
      postAnalyser.smoothingTimeConstant = 0.72;

      const workletNode = new AudioWorkletNode(ctx, 'molecular-fx-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      });

      inputBus.connect(preAnalyser);
      inputBus.connect(workletNode);
      workletNode.connect(postAnalyser);
      postAnalyser.connect(ctx.destination);

      this.inputBus = inputBus;
      this.preAnalyser = preAnalyser;
      this.postAnalyser = postAnalyser;
      this.workletNode = workletNode;

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error('Timed out waiting for AudioWorklet WASM instantiation.'));
        }, 8000);

        workletNode.port.onmessage = (event: MessageEvent) => {
          const data = event.data;
          if (!data || typeof data.type !== 'string') return;

          if (data.type === 'wasm-ready') {
            window.clearTimeout(timeout);
            const baseLatMs = ((ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0)) * 1000;
            this.emitInfo({
              status: 'ready',
              workletState: 'running',
              errorMessage: null,
              hostSampleRate: data.hostSampleRate,
              nativeSampleRate: data.nativeSampleRate,
              blockSize: data.blockSize,
              latencySamples: data.latencySamples,
              effectCount: data.effectCount ?? 46,
              baseLatencyMs: baseLatMs,
              resampling: Boolean(data.resampling),
              wasmBytesSize: wasmBuf.byteLength,
            });
            resolve();
          } else if (data.type === 'wasm-error') {
            window.clearTimeout(timeout);
            reject(new Error(`WASM instantiation failed inside AudioWorklet: ${data.message}`));
          } else if (data.type === 'telemetry') {
            this.onTelemetry?.(data as TelemetryFrame);
          }
        };

        const transferable = wasmBuf.slice(0);
        workletNode.port.postMessage(
          {
            type: 'init-wasm',
            wasmBytes: transferable,
            effectId: this.effectId,
            params: [...this.params],
            rootNote: this.rootNote,
            mix: this.mix,
            bypass: this.bypass,
            inputGain: dbToGain(this.inputGainDb),
            outputGain: dbToGain(this.outputGainDb),
            guard: this.guardEnabled,
            decorrelate: this.stereoDecorrelate,
          },
          [transferable]
        );
      });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitInfo({
        status: 'error',
        workletState: 'error',
        errorMessage: message,
      });
      return false;
    }
  }

  async loadAudioFile(file: File): Promise<LoadedClipInfo> {
    const ok = await this.ensureInitialized();
    if (!ok || !this.ctx) {
      throw new Error(this.info.errorMessage ?? 'Audio engine is not initialized.');
    }

    const arrayBuf = await file.arrayBuffer();
    const decoded = await this.ctx.decodeAudioData(arrayBuf.slice(0));
    this.stopFile();
    this.audioBuffer = decoded;
    this.pauseOffset = 0;

    return {
      name: file.name,
      duration: decoded.duration,
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      peaks: computeOverviewPeaks(decoded),
    };
  }

  async loadBuiltinClip(id: BuiltinClipId): Promise<LoadedClipInfo> {
    const ok = await this.ensureInitialized();
    if (!ok || !this.ctx) {
      throw new Error(this.info.errorMessage ?? 'Audio engine is not initialized.');
    }

    const decoded = buildTestAudioBuffer(this.ctx, id);
    this.stopFile();
    this.audioBuffer = decoded;
    this.pauseOffset = 0;

    const label =
      id === 'plucks'
        ? 'Built-in: Plucked Phrase'
        : id === 'bell'
          ? 'Built-in: Acousmatic Bell'
          : 'Built-in: 440 Hz Sine + Impulse';

    return {
      name: label,
      duration: decoded.duration,
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      peaks: computeOverviewPeaks(decoded),
    };
  }

  async playFile(): Promise<boolean> {
    const ok = await this.ensureInitialized();
    if (!ok || !this.ctx || !this.inputBus || !this.audioBuffer) return false;
    if (this.sourceMode !== 'file') {
      await this.setSourceMode('file');
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.detachFileSource();

    const src = this.ctx.createBufferSource();
    src.buffer = this.audioBuffer;
    src.loop = this.loop;
    src.connect(this.inputBus);

    const duration = this.audioBuffer.duration;
    const offset = this.pauseOffset >= duration ? 0 : this.pauseOffset;

    src.onended = () => {
      if (this.fileSource === src) {
        this.fileSource = null;
        if (!this.loop) {
          this.isPlaying = false;
          this.pauseOffset = 0;
          this.onTransportEnd?.();
        }
      }
    };

    src.start(0, offset);
    this.fileSource = src;
    this.startCtxTime = this.ctx.currentTime - offset;
    this.isPlaying = true;
    return true;
  }

  pauseFile() {
    if (!this.isPlaying || !this.ctx || !this.audioBuffer) return;
    const elapsed = this.ctx.currentTime - this.startCtxTime;
    const dur = this.audioBuffer.duration;
    this.pauseOffset = this.loop ? elapsed % dur : Math.min(dur, elapsed);
    this.detachFileSource();
    this.isPlaying = false;
  }

  stopFile() {
    this.detachFileSource();
    this.isPlaying = false;
    this.pauseOffset = 0;
  }

  seekFile(seconds: number) {
    if (!this.audioBuffer) return;
    const clamped = Math.max(0, Math.min(this.audioBuffer.duration, seconds));
    this.pauseOffset = clamped;
    if (this.isPlaying) {
      void this.playFile();
    }
  }

  setLoop(enabled: boolean) {
    this.loop = enabled;
    if (this.fileSource) {
      this.fileSource.loop = enabled;
    }
  }

  getPlaybackPosition(): { current: number; duration: number; playing: boolean } {
    const duration = this.audioBuffer?.duration ?? 0;
    if (!this.isPlaying || !this.ctx || duration <= 0) {
      return { current: this.pauseOffset, duration, playing: false };
    }
    const elapsed = this.ctx.currentTime - this.startCtxTime;
    const current = this.loop ? ((elapsed % duration) + duration) % duration : Math.min(duration, elapsed);
    return { current, duration, playing: true };
  }

  private detachFileSource() {
    if (this.fileSource) {
      try {
        this.fileSource.onended = null;
        this.fileSource.stop();
        this.fileSource.disconnect();
      } catch {
        // Already stopped
      }
      this.fileSource = null;
    }
  }

  async listInputDevices(): Promise<AudioInputDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, idx) => ({
        deviceId: d.deviceId,
        label: d.label || `Audio Input ${idx + 1}`,
      }));
  }

  async setSourceMode(mode: SourceMode, deviceId?: string): Promise<void> {
    this.sourceMode = mode;
    if (mode === 'file') {
      this.stopLiveInput();
      return;
    }
    this.pauseFile();
    await this.startLiveInput(deviceId);
  }

  async startLiveInput(deviceId?: string): Promise<void> {
    const ok = await this.ensureInitialized();
    if (!ok || !this.ctx || !this.inputBus) {
      throw new Error(this.info.errorMessage ?? 'Audio engine failed to initialize.');
    }
    this.stopLiveInput();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Live audio capture (getUserMedia) is unavailable in this browser.');
    }

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const src = this.ctx.createMediaStreamSource(stream);
    src.connect(this.inputBus);
    this.liveStream = stream;
    this.liveSource = src;
    this.liveActive = true;
  }

  stopLiveInput() {
    if (this.liveSource) {
      try {
        this.liveSource.disconnect();
      } catch {
        // ignore
      }
      this.liveSource = null;
    }
    if (this.liveStream) {
      for (const track of this.liveStream.getTracks()) {
        track.stop();
      }
      this.liveStream = null;
    }
    this.liveActive = false;
  }

  isLiveActive(): boolean {
    return this.liveActive;
  }

  // --- DSP Control Messages ---

  selectEffect(id: EffectId, customParams?: [number, number, number, number]) {
    this.effectId = id;
    const meta = getEffectMeta(id);
    this.params = customParams
      ? [...customParams]
      : [
          meta.params[0].defaultValue,
          meta.params[1].defaultValue,
          meta.params[2].defaultValue,
          meta.params[3].defaultValue,
        ];
    this.workletNode?.port.postMessage({
      type: 'select',
      effectId: id,
      params: [...this.params],
    });
  }

  setParam(index: 0 | 1 | 2 | 3, value: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    this.params[index] = clamped;
    this.workletNode?.port.postMessage({ type: 'param', index, value: clamped });
  }

  setRootNote(midiNote: number) {
    const clamped = Math.max(24, Math.min(84, Math.round(midiNote)));
    this.rootNote = clamped;
    this.workletNode?.port.postMessage({ type: 'rootNote', value: clamped });
  }

  setMix(mix01: number) {
    this.mix = Math.max(0, Math.min(1, mix01));
    this.workletNode?.port.postMessage({ type: 'mix', value: this.mix });
  }

  setBypass(bypassed: boolean) {
    this.bypass = bypassed;
    this.workletNode?.port.postMessage({ type: 'bypass', value: bypassed });
  }

  setInputGainDb(db: number) {
    this.inputGainDb = db;
    this.workletNode?.port.postMessage({ type: 'inputGain', value: dbToGain(db) });
  }

  setOutputGainDb(db: number) {
    this.outputGainDb = db;
    this.workletNode?.port.postMessage({ type: 'outputGain', value: dbToGain(db) });
  }

  setGuardEnabled(enabled: boolean) {
    this.guardEnabled = enabled;
    this.workletNode?.port.postMessage({ type: 'guard', value: enabled });
  }

  setStereoDecorrelate(enabled: boolean) {
    this.stereoDecorrelate = enabled;
    this.workletNode?.port.postMessage({ type: 'decorrelate', value: enabled });
  }

  resetDspState() {
    this.workletNode?.port.postMessage({ type: 'reset' });
  }

  async exportProcessedWav(): Promise<{ blob: Blob; filename: string }> {
    if (!this.audioBuffer || !this.wasmBytesCache) {
      throw new Error('Load an audio clip and initialize the WASM engine before exporting.');
    }

    const result = await WebAssembly.instantiate(this.wasmBytesCache.slice(0), {});
    const ex = result.instance.exports as unknown as {
      memory: WebAssembly.Memory;
      fx_init: (sr: number, maxFrames: number) => number;
      fx_select: (id: number) => number;
      fx_set_param: (idx: number, val: number) => void;
      fx_set_root_note?: (note: number) => void;
      fx_set_mix: (v: number) => void;
      fx_set_bypass: (b: number) => void;
      fx_set_input_gain: (g: number) => void;
      fx_set_output_gain: (g: number) => void;
      fx_set_guard_enabled: (e: number) => void;
      fx_set_stereo_decorrelate: (e: number) => void;
      fx_reset: () => void;
      fx_process: (inL: number, inR: number, outL: number, outR: number, n: number) => void;
      fx_get_in_l_ptr: () => number;
      fx_get_in_r_ptr: () => number;
      fx_get_out_l_ptr: () => number;
      fx_get_out_r_ptr: () => number;
    };

    const sr = this.audioBuffer.sampleRate;
    const frames = this.audioBuffer.length;
    const srcL = this.audioBuffer.getChannelData(0);
    const srcR = this.audioBuffer.numberOfChannels > 1 ? this.audioBuffer.getChannelData(1) : srcL;

    ex.fx_init(sr, 128);
    ex.fx_set_root_note?.(this.rootNote);
    ex.fx_select(this.effectId);
    for (let i = 0; i < 4; i++) ex.fx_set_param(i, this.params[i]);
    ex.fx_set_mix(this.mix);
    ex.fx_set_bypass(this.bypass ? 1 : 0);
    ex.fx_set_input_gain(dbToGain(this.inputGainDb));
    ex.fx_set_output_gain(dbToGain(this.outputGainDb));
    ex.fx_set_guard_enabled(this.guardEnabled ? 1 : 0);
    ex.fx_set_stereo_decorrelate(this.stereoDecorrelate ? 1 : 0);
    ex.fx_reset();

    const inLPtr = ex.fx_get_in_l_ptr();
    const inRPtr = ex.fx_get_in_r_ptr();
    const outLPtr = ex.fx_get_out_l_ptr();
    const outRPtr = ex.fx_get_out_r_ptr();

    const wInL = new Float32Array(ex.memory.buffer, inLPtr, 1024);
    const wInR = new Float32Array(ex.memory.buffer, inRPtr, 1024);
    const wOutL = new Float32Array(ex.memory.buffer, outLPtr, 1024);
    const wOutR = new Float32Array(ex.memory.buffer, outRPtr, 1024);

    const outL = new Float32Array(frames);
    const outR = new Float32Array(frames);
    const chunk = 128;

    for (let off = 0; off < frames; off += chunk) {
      const n = Math.min(chunk, frames - off);
      wInL.set(srcL.subarray(off, off + n));
      wInR.set(srcR.subarray(off, off + n));
      ex.fx_process(inLPtr, inRPtr, outLPtr, outRPtr, n);
      outL.set(wOutL.subarray(0, n), off);
      outR.set(wOutR.subarray(0, n), off);
    }

    const meta = getEffectMeta(this.effectId);
    const blob = encodeWavStereo(outL, outR, sr);
    return {
      blob,
      filename: `molecular-${meta.slug}-${sr}hz.wav`,
    };
  }

  dispose() {
    this.stopFile();
    this.stopLiveInput();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
