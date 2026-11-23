/* SPDX-License-Identifier: GPL-3.0-only
 * Molecular FX Lab — Deterministic Audition Signals & WAV Encoder
 */

export type BuiltinClipId = 'plucks' | 'bell' | 'calibration';

export interface BuiltinClipMeta {
  id: BuiltinClipId;
  label: string;
  durationSec: number;
  description: string;
}

export const BUILTIN_CLIPS: BuiltinClipMeta[] = [
  {
    id: 'plucks',
    label: 'Plucked Phrase (4.0 s)',
    durationSec: 4.0,
    description: 'Stereo acoustic-style plucks with crisp transients for auditioning echoes, reverse swells, and glitch loops.',
  },
  {
    id: 'bell',
    label: 'Acousmatic Bell (4.0 s)',
    durationSec: 4.0,
    description: 'Struck inharmonic metallic partials and transient bursts inspired by GRM studio sources.',
  },
  {
    id: 'calibration',
    label: 'Sine + Impulse Ref (2.0 s)',
    durationSec: 2.0,
    description: 'Deterministic 440 Hz / 660 Hz stereo reference tone with unit impulse matching the C99/WASM test vector.',
  },
];

export function buildTestAudioBuffer(ctx: BaseAudioContext, id: BuiltinClipId): AudioBuffer {
  const sr = ctx.sampleRate;
  const clip = BUILTIN_CLIPS.find((c) => c.id === id) ?? BUILTIN_CLIPS[0];
  const length = Math.round(sr * clip.durationSec);
  const buffer = ctx.createBuffer(2, length, sr);
  const chL = buffer.getChannelData(0);
  const chR = buffer.getChannelData(1);

  if (id === 'plucks') {
    // Stereo arpeggiated harmonic plucks with subtle percussive click
    const notes = [196.0, 246.94, 293.66, 369.99, 440.0, 329.63, 293.66, 220.0];
    const stepDur = 0.5;
    for (let i = 0; i < length; i++) {
      const t = i / sr;
      const stepIdx = Math.floor(t / stepDur) % notes.length;
      const localT = t - Math.floor(t / stepDur) * stepDur;
      const f = notes[stepIdx];
      const env = Math.exp(-localT * 7.5) * Math.min(1, localT * 450);
      const click = Math.exp(-localT * 180) * Math.sin(2 * Math.PI * 1900 * localT) * 0.12;

      const bodyL =
        0.52 * Math.sin(2 * Math.PI * f * localT) +
        0.24 * Math.sin(2 * Math.PI * f * 2.0 * localT) * Math.exp(-localT * 4) +
        0.11 * Math.sin(2 * Math.PI * f * 3.0 * localT) * Math.exp(-localT * 9);
      const bodyR =
        0.5 * Math.sin(2 * Math.PI * (f * 1.003) * localT + 0.4) +
        0.22 * Math.sin(2 * Math.PI * (f * 2.002) * localT) * Math.exp(-localT * 4.5) +
        0.13 * Math.sin(2 * Math.PI * (f * 3.005) * localT) * Math.exp(-localT * 8);

      const pan = stepIdx % 2 === 0 ? 0.65 : 0.35;
      chL[i] = (bodyL * env + click) * (0.45 + pan * 0.45);
      chR[i] = (bodyR * env + click) * (0.45 + (1 - pan) * 0.45);
    }
  } else if (id === 'bell') {
    // Struck inharmonic bell partials + dry studio impulses
    const strikes = [0.05, 1.15, 2.3, 3.1];
    const ratios = [1.0, 2.0, 2.756, 3.84, 5.404];
    const amps = [0.42, 0.24, 0.18, 0.11, 0.07];
    const decays = [1.6, 2.4, 3.3, 4.8, 6.5];
    const baseFreqs = [220, 261.63, 196.0, 311.13];

    for (let sIdx = 0; sIdx < strikes.length; sIdx++) {
      const startSamp = Math.floor(strikes[sIdx] * sr);
      const baseF = baseFreqs[sIdx];
      for (let i = startSamp; i < length; i++) {
        const dt = (i - startSamp) / sr;
        if (dt > 1.8) break;
        const attack = Math.min(1, dt * 600);
        let sumL = 0;
        let sumR = 0;
        for (let k = 0; k < ratios.length; k++) {
          const env = Math.exp(-dt * decays[k]) * amps[k] * attack;
          const freq = baseF * ratios[k];
          sumL += env * Math.sin(2 * Math.PI * freq * dt);
          sumR += env * Math.sin(2 * Math.PI * (freq * (1 + (k % 2 ? 0.004 : -0.003))) * dt + 0.3 * k);
        }
        chL[i] += sumL * 0.72;
        chR[i] += sumR * 0.72;
      }
    }
  } else {
    // Deterministic sine + impulse calibration signal
    for (let i = 0; i < length; i++) {
      const t = i / sr;
      const beatT = t % 0.5;
      const env = Math.exp(-beatT * 10);
      let vl = 0.45 * Math.sin(2 * Math.PI * 440 * t) * env;
      let vr = 0.45 * Math.sin(2 * Math.PI * 660 * t) * env;
      if (i === 64 || i === Math.floor(sr * 1.0)) {
        vl += 0.4;
        vr += 0.4;
      }
      chL[i] = vl;
      chR[i] = vr;
    }
  }

  return buffer;
}

export function encodeWavStereo(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  const frames = left.length;
  const dataBytes = frames * 4;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 2, true); // stereo
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let pos = 44;
  for (let i = 0; i < frames; i++) {
    const fl = Math.max(-1, Math.min(1, left[i]));
    const fr = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(pos, Math.round(fl * 32767), true);
    view.setInt16(pos + 2, Math.round(fr * 32767), true);
    pos += 4;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
