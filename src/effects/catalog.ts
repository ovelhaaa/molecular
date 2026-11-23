/* SPDX-License-Identifier: GPL-3.0-only
 * Molecular FX Lab — Complete 46-Effect Catalog & Exact C Parameter Mappings
 *
 * Every identifier, symbol (AT_SYM), default (RM_HOME / NX_HOME), draw range
 * (RM_LO..RM_HI / NX_LO..NX_HI), and scaling formula is taken directly from:
 *   - core/vendor/norilsk/effects.c (25 Norilsk effects)
 *   - core/vendor/tonitor/delay.c & reverb.c (2 Tonitor heavy effects)
 *   - core/atoms.c & core/gsm.c (19 Molecular own atoms)
 */

export type EffectId = number;

export type EffectOrigin = 'norilsk' | 'tonitor' | 'molecular';

export type EffectCategory = 'time' | 'glitch' | 'spectral' | 'drive' | 'dynamics';

export interface EffectCategoryDef {
  id: EffectCategory | 'all';
  label: string;
}

export const EFFECT_CATEGORIES: EffectCategoryDef[] = [
  { id: 'all', label: 'All (46)' },
  { id: 'time', label: 'Time & Space' },
  { id: 'glitch', label: 'Glitch & Granular' },
  { id: 'spectral', label: 'Spectral & Resonators' },
  { id: 'drive', label: 'Drive, Fold & Lo-Fi' },
  { id: 'dynamics', label: 'Dynamics & Physical' },
];

export interface EffectParamMeta {
  index: 0 | 1 | 2 | 3;
  name: string;
  shortLabel: string;
  min: number;
  max: number;
  defaultValue: number;
  drawLo: number;
  drawHi: number;
  unit: string;
  scale: 'linear' | 'probabilistic' | 'compound' | 'one-pole' | 'bit-mask' | 'log' | 'stepped';
  description: string;
  formatValue: (raw: number) => string;
}

export interface EffectPreset {
  name: string;
  params: [number, number, number, number];
  mix: number;
}

export interface EffectMeta {
  id: EffectId;
  slug: string;
  symbol: string;
  name: string;
  origin: EffectOrigin;
  category: EffectCategory;
  tagline: string;
  description: string;
  sourceFile: string;
  cFunction: string;
  cStruct: string;
  stateBytes: number;
  internalRateHz: number;
  storageFormat: string;
  usesRootNote?: boolean;
  trueStereo?: boolean;
  portability: 'verified';
  params: [EffectParamMeta, EffectParamMeta, EffectParamMeta, EffectParamMeta];
  presets: EffectPreset[];
}

/* Formatting helpers matched to Molecular's Q15 C equations */
function onePoleQ15ToHz(kQ15: number, fs = 44100): number {
  const a = Math.min(0.995, Math.max(0.001, kQ15 / 32768));
  return Math.round((-fs / (2 * Math.PI)) * Math.log(1 - a));
}

function fmtHz(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)} kHz`;
  return `${Math.round(hz)} Hz`;
}

function fmtTone44k(v: number, loK = 1400, hiK = 30000): string {
  const k = loK + Math.floor((v * (hiK - loK)) / 100);
  return fmtHz(onePoleQ15ToHz(k, 44100));
}

function fmtPct(v: number): string {
  return `${v}%`;
}

function fmtMult(minX: number, maxX: number): (v: number) => string {
  return (v) => `${(minX + ((maxX - minX) * v) / 100).toFixed(1)}×`;
}

function fmtLogHz(minHz: number, octaves: number): (v: number) => string {
  return (v) => fmtHz(minHz * Math.pow(2, (v / 100) * octaves));
}

function p(
  index: 0 | 1 | 2 | 3,
  name: string,
  defaultValue: number,
  drawLo: number,
  drawHi: number,
  unit: string,
  scale: EffectParamMeta['scale'],
  description: string,
  formatValue: (raw: number) => string
): EffectParamMeta {
  return {
    index,
    name,
    shortLabel: name.charAt(0) + name.slice(1).toLowerCase(),
    min: 0,
    max: 100,
    defaultValue,
    drawLo,
    drawHi,
    unit,
    scale,
    description,
    formatValue,
  };
}

export const MIDI_ROOT_NOTES: { midi: number; label: string }[] = [
  { midi: 36, label: 'C2' },
  { midi: 38, label: 'D2' },
  { midi: 40, label: 'E2' },
  { midi: 41, label: 'F2' },
  { midi: 43, label: 'G2' },
  { midi: 45, label: 'A2' },
  { midi: 47, label: 'B2' },
  { midi: 48, label: 'C3' },
  { midi: 50, label: 'D3' },
  { midi: 52, label: 'E3' },
  { midi: 53, label: 'F3' },
  { midi: 55, label: 'G3' },
  { midi: 57, label: 'A3' },
  { midi: 59, label: 'B3' },
  { midi: 60, label: 'C4' },
  { midi: 62, label: 'D4' },
  { midi: 64, label: 'E4' },
  { midi: 67, label: 'G4' },
  { midi: 69, label: 'A4' },
];

export const EFFECTS_CATALOG: EffectMeta[] = [
  /* ===================== 0..2: MVP TRIO (NORILSK) ===================== */
  {
    id: 0,
    slug: 'tape',
    symbol: 'TA',
    name: 'TAPE',
    origin: 'norilsk',
    category: 'time',
    tagline: '8-bit μ-law magnetic delay with dropouts, head saturation & age',
    description:
      'Echo line at 22.05 kHz in 8-bit μ-law (0.9 s ring). Feedback passes through a tanh tape head and age filter; time changes crossfade over 23 ms with ±0.1% thermal wow and signal-gated hiss.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_tap',
    cStruct: 'm_tap_t',
    stateBytes: 19952,
    internalRateHz: 22050,
    storageFormat: '8-bit μ-law · 19,900 samp (0.90 s)',
    portability: 'verified',
    params: [
      p(0, 'TIME', 50, 10, 100, 'ms', 'linear', 'Delay time 25–900 ms with 23 ms dual-head crossfade.', (v) => `${25 + Math.floor((v * 875) / 100)} ms`),
      p(1, 'DROPOUTS', 30, 0, 100, '%', 'probabilistic', 'Tape oxide failure rate (20–200 ms, 3 ms click-free edge).', (v) => (v === 0 ? 'Off' : `${v}%`)),
      p(2, 'FEEDBACK', 45, 0, 90, '%', 'linear', 'Regeneration (0–94%) through saturating tape head.', (v) => `${Math.round(((v * 308) / 32768) * 100)}%`),
      p(3, 'AGE', 40, 0, 85, '%', 'compound', 'Couples loop darkening, head drive (1.5×–4.0×), and gated hiss.', (v) => {
        const k = 31000 - Math.floor((v * 19000) / 100);
        const drv = (6144 + Math.floor((v * 10240) / 100)) / 4096;
        return `${fmtHz(onePoleQ15ToHz(k, 22050))} · ${drv.toFixed(1)}×`;
      }),
    ],
    presets: [
      { name: 'RM_HOME', params: [50, 30, 45, 40], mix: 0.65 },
      { name: 'Worn Slap', params: [16, 22, 38, 72], mix: 0.55 },
      { name: 'Decay Loop', params: [78, 55, 82, 68], mix: 0.75 },
    ],
  },
  {
    id: 1,
    slug: 'reverse',
    symbol: 'RS',
    name: 'REVERSE',
    origin: 'norilsk',
    category: 'time',
    tagline: 'Dual 180° triangle-windowed backward read heads with smeared feedback',
    description:
      'Captures audio into a 0.9 s 8-bit μ-law buffer at 22.05 kHz and reads 60–220 ms windows backwards at original pitch. Two overlapping triangle heads keep amplitude constant while feedback recursively smears.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_rvs',
    cStruct: 'm_rvs_t',
    stateBytes: 19864,
    internalRateHz: 22050,
    storageFormat: '8-bit μ-law · 19,845 samp (0.90 s)',
    portability: 'verified',
    params: [
      p(0, 'WINDOW', 40, 0, 100, 'ms', 'linear', 'Reverse grain window length (60–220 ms).', (v) => `${60 + Math.floor((v * 160) / 100)} ms`),
      p(1, 'TONE', 60, 30, 100, 'Hz', 'one-pole', 'One-pole low-pass on reversed output (~1.4–13 kHz).', (v) => fmtHz(onePoleQ15ToHz(6400 + Math.floor((v * 24600) / 100), 22050))),
      p(2, 'FEEDBACK', 30, 0, 80, '%', 'linear', 'Reversed output returned to the buffer (0–70%).', (v) => `${Math.round(v * 0.7)}%`),
      p(3, 'SPREAD', 50, 0, 100, '×', 'linear', 'How far back in the buffer heads reach (1.0×–3.0× window).', (v) => `${(1 + v / 50).toFixed(2)}× win`),
    ],
    presets: [
      { name: 'RM_HOME', params: [40, 60, 30, 50], mix: 0.7 },
      { name: 'Swell', params: [85, 52, 62, 70], mix: 0.8 },
      { name: 'Backmask', params: [18, 82, 15, 20], mix: 0.65 },
    ],
  },
  {
    id: 2,
    slug: 'glitch',
    symbol: 'GL',
    name: 'GLITCH',
    origin: 'norilsk',
    category: 'glitch',
    tagline: 'Address-bit-bent ring buffer with clocked jumps & micro-stutter loops',
    description:
      'Russolo-inspired bent buffer (0.74 s, 16,384 samples at 22.05 kHz, 8-bit μ-law). An internal clock (0.5–16 Hz) XOR-flips address bits, jumps within the read span, or traps 10–120 ms stutter loops with 2 ms crossfades.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_glt',
    cStruct: 'm_glt_t',
    stateBytes: 16448,
    internalRateHz: 22050,
    storageFormat: '8-bit μ-law · 16,384 samp (0.74 s)',
    portability: 'verified',
    params: [
      p(0, 'BEND', 50, 15, 100, '%', 'bit-mask', 'Probability and XOR bit reach (bit 4..13) on clock ticks.', (v) => `${v}% · b${4 + Math.floor((v * 9) / 100)}`),
      p(1, 'CLOCK', 40, 0, 90, 'Hz', 'linear', 'Event clock rate (0.50–16.00 Hz).', (v) => `${(0.5 + (v * 15.5) / 100).toFixed(2)} Hz`),
      p(2, 'STUTTER', 35, 0, 85, '%', 'probabilistic', 'Chance of locking a 10–120 ms micro-loop for 2–6 repeats.', fmtPct),
      p(3, 'SPAN', 45, 0, 100, 'ms', 'linear', 'Read-behind buffer span (20–700 ms) for clock jumps.', (v) => `${20 + Math.floor((v * 680) / 100)} ms`),
    ],
    presets: [
      { name: 'RM_HOME', params: [50, 40, 35, 45], mix: 0.8 },
      { name: 'Stutter', params: [30, 72, 78, 35], mix: 0.85 },
      { name: 'Fracture', params: [92, 55, 25, 85], mix: 0.9 },
    ],
  },

  /* ===================== 3..24: REMAINING 22 NORILSK EFFECTS ===================== */
  {
    id: 3,
    slug: 'filter',
    symbol: 'FL',
    name: 'FILTER',
    origin: 'norilsk',
    category: 'spectral',
    tagline: 'Driven state-variable filter (LP / BP / HP / Notch) with Q compensation',
    description:
      'Drives input (1×–12× tanh) into a fixed-point Chamberlin/TPT state-variable filter across 9 octaves (30 Hz–16 kHz) with high-frequency Q tame and soft-clipped output.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_flt',
    cStruct: 'm_flt_t',
    stateBytes: 56,
    internalRateHz: 44100,
    storageFormat: 'SVF Q24 state',
    portability: 'verified',
    params: [
      p(0, 'TYPE', 20, 0, 100, '', 'stepped', 'Filter mode: Low-pass, Band-pass, High-pass, or Notch.', (v) => (v < 25 ? 'Low-Pass' : v < 50 ? 'Band-Pass' : v < 75 ? 'High-Pass' : 'Notch')),
      p(1, 'FREQ', 55, 35, 85, 'Hz', 'log', 'Cutoff frequency (30 Hz up 9 octaves to 16 kHz).', (v) => fmtHz(Math.min(16000, 30 * Math.pow(2, (v / 100) * 9)))),
      p(2, 'RES', 40, 0, 80, 'Q', 'linear', 'Resonance Q 0.7–12 (tamed above 3 kHz).', (v) => `Q ${(0.7 + (v * 11.3) / 100).toFixed(1)}`),
      p(3, 'DRIVE', 30, 0, 100, '×', 'linear', 'Pre-filter tanh saturation drive (1×–12×).', fmtMult(1, 12)),
    ],
    presets: [
      { name: 'RM_HOME', params: [20, 55, 40, 30], mix: 1.0 },
      { name: 'Acid Band', params: [35, 48, 76, 65], mix: 1.0 },
      { name: 'Notch Bite', params: [85, 62, 68, 45], mix: 0.9 },
    ],
  },
  {
    id: 4,
    slug: 'fold',
    symbol: 'FO',
    name: 'FOLD',
    origin: 'norilsk',
    category: 'drive',
    tagline: 'Two-stage symmetric wavefolder with post low-pass smoothing',
    description:
      'Drives audio (0.5×–16×) into a dual cascaded triangle-reflection wavefolder with adjustable folding window width and reciprocal fast modulo arithmetic.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_fld',
    cStruct: 'm_fld_t',
    stateBytes: 40,
    internalRateHz: 44100,
    storageFormat: 'Stateless fold + 1-pole LP',
    portability: 'verified',
    params: [
      p(0, 'DRIVE', 45, 10, 90, '×', 'log', 'Stage 1 input drive (0.5×–16×).', (v) => `${(0.5 * Math.pow(2, (v * 5) / 100)).toFixed(1)}×`),
      p(1, 'WINDOW', 45, 10, 90, '', 'linear', 'Reflection fold threshold (0.08–0.58 full scale).', (v) => (0.08 + (v * 0.5) / 100).toFixed(2)),
      p(2, 'STAGE 2', 20, 0, 80, '×', 'linear', 'Second wavefolder stage drive (1×–5×).', fmtMult(1, 5)),
      p(3, 'TONE', 70, 30, 100, 'Hz', 'one-pole', 'Post-fold low-pass filter (300 Hz–16 kHz).', (v) => fmtTone44k(v, 1400, 29430)),
    ],
    presets: [
      { name: 'RM_HOME', params: [45, 45, 20, 70], mix: 0.85 },
      { name: 'West Coast', params: [72, 28, 55, 64], mix: 0.9 },
      { name: 'Subtle Grit', params: [28, 65, 10, 50], mix: 0.7 },
    ],
  },
  {
    id: 5,
    slug: 'mulaw',
    symbol: 'MU',
    name: 'MULAW',
    origin: 'norilsk',
    category: 'drive',
    tagline: 'Fractional sample-rate reducer & 2–8 bit μ-law companding crusher',
    description:
      'Downsamples fractionally from 44.1 kHz down to 1.4 kHz, quantizes through an 8-bit μ-law compander (dropping up to 6 mantissa bits), framed by dual 2-pole anti-aliasing/reconstruction filters.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_mu',
    cStruct: 'm_mu_t',
    stateBytes: 56,
    internalRateHz: 44100,
    storageFormat: '2× 2-pole filters + μ-law S&H',
    portability: 'verified',
    params: [
      p(0, 'RATE', 45, 0, 100, 'Hz', 'log', 'Sample rate down to FS/32 (~1.4 kHz).', (v) => fmtHz(44100 / (1 + (v * v * 31) / 10000))),
      p(1, 'BITS', 60, 30, 100, 'bit', 'stepped', 'Companded μ-law bit depth (2–8 bits including sign).', (v) => `${2 + Math.floor((v * 7) / 101)} bits`),
      p(2, 'FILTER', 50, 20, 100, '%', 'linear', 'Pre/post cutoff as fraction of reduced sample rate (open = aliasing).', (v) => `${5 + Math.round(v * 0.95)}% nyq`),
      p(3, 'DRIVE', 30, 0, 80, '×', 'linear', 'Pre-compander drive (1×–8×, lifts quiet detail).', fmtMult(1, 8)),
    ],
    presets: [
      { name: 'RM_HOME', params: [45, 60, 50, 30], mix: 0.85 },
      { name: 'Early Sampler', params: [52, 72, 42, 35], mix: 0.9 },
      { name: '2-Bit Alias', params: [78, 12, 95, 60], mix: 0.8 },
    ],
  },
  {
    id: 6,
    slug: 'shift',
    symbol: 'SH',
    name: 'SHIFT',
    origin: 'norilsk',
    category: 'spectral',
    tagline: 'Niemitalo 8-pole Hilbert SSB frequency shifter & ring modulator',
    description:
      'Dual 4-section z⁻² allpass Hilbert network (90° phase quadrature across 20 Hz–20 kHz) shifting every partial linearly by 40–900 Hz up, down, or both sidebands simultaneously.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_shf',
    cStruct: 'm_shf_t',
    stateBytes: 144,
    internalRateHz: 44100,
    storageFormat: '8× 2nd-order Hilbert allpasses',
    portability: 'verified',
    params: [
      p(0, 'SHIFT', 40, 0, 100, 'Hz', 'log', 'Linear frequency shift (40–900 Hz).', (v) => fmtHz(40 * Math.pow(900 / 40, v / 100))),
      p(1, 'DRIVE', 30, 0, 90, '×', 'linear', 'Pre-shift tanh drive (1×–6×) for denser sidebands.', fmtMult(1, 6)),
      p(2, 'DIR', 70, 0, 100, '', 'stepped', 'Sideband direction: Down (<45), Both/Ring (45–55), Up (>55).', (v) => (v < 45 ? 'Down (-)' : v > 55 ? 'Up (+)' : 'Both (RM)')),
      p(3, 'TONE', 50, 0, 100, 'Hz', 'one-pole', 'Post-shift low-pass tone (1–16 kHz).', (v) => fmtTone44k(v, 2800, 31000)),
    ],
    presets: [
      { name: 'RM_HOME', params: [40, 30, 70, 50], mix: 0.8 },
      { name: 'Clangor Up', params: [62, 45, 80, 75], mix: 0.85 },
      { name: 'Sub Shift', params: [24, 25, 20, 60], mix: 0.75 },
    ],
  },
  {
    id: 7,
    slug: 'modal',
    symbol: 'MO',
    name: 'MODAL',
    origin: 'norilsk',
    category: 'spectral',
    tagline: '3-mode Smith-Angell inharmonic resonator tuned to Root Note',
    description:
      'Three error-feedback Q28 resonators tuned to the scale root octave and mode ratios f, f·s, f·s² (s = 1.0–4.2) with Q up to 325 and automatic make-up gain.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_mdl',
    cStruct: 'm_mdl_t',
    stateBytes: 104,
    internalRateHz: 44100,
    storageFormat: '3× Q28 error-feedback resonators',
    usesRootNote: true,
    portability: 'verified',
    params: [
      p(0, 'OCTAVE', 40, 0, 100, 'oct', 'stepped', 'Octave transposition above scale root (1–4 oct).', (v) => `+${1 + Math.floor((v * 4) / 101)} oct`),
      p(1, 'Q / RING', 55, 15, 85, 'Q', 'log', 'Resonator Q factor (4–300).', (v) => `Q ${Math.round(4 * Math.pow(2, (v * 6.22) / 100))}`),
      p(2, 'SPREAD', 40, 0, 100, '×', 'linear', 'Mode frequency ratio s (1.0×–4.2×, harmonic to metallic).', (v) => `${(1 + (v * 3.2) / 100).toFixed(2)}×`),
      p(3, 'MODES', 50, 20, 100, '%', 'linear', 'Upper modes 2 & 3 level relative to fundamental.', (v) => `${25 + Math.round(v * 0.75)}%`),
    ],
    presets: [
      { name: 'RM_HOME', params: [40, 55, 40, 50], mix: 0.8 },
      { name: 'Glass Chime', params: [65, 78, 56, 80], mix: 0.85 },
      { name: 'Hollow Pipe', params: [22, 48, 32, 45], mix: 0.75 },
    ],
  },
  {
    id: 8,
    slug: 'string',
    symbol: 'ST',
    name: 'STRING',
    origin: 'norilsk',
    category: 'spectral',
    tagline: 'Triple detuned Karplus-Strong sympathetic strings tuned to Root',
    description:
      'Three fractional-delay waveguide strings tuned to the root (+0.9% and -0.7% detuned chorus pair) with calibrated RT60 decay from 80 ms to 8 s and loop damping.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_str',
    cStruct: 'm_str_t',
    stateBytes: 8464,
    internalRateHz: 44100,
    storageFormat: '3× 1,400-samp int16 waveguides',
    usesRootNote: true,
    portability: 'verified',
    params: [
      p(0, 'OCTAVE', 35, 0, 100, 'oct', 'stepped', 'String tuning octave above root (C1–B4).', (v) => `+${1 + Math.floor((v * 4) / 101)} oct`),
      p(1, 'DECAY', 60, 25, 95, 's', 'log', 'Sympathetic ring time (0.08–8.0 s).', (v) => `${(0.08 * Math.pow(100, v / 100)).toFixed(2)} s`),
      p(2, 'DETUNE', 40, 0, 100, '%', 'linear', 'Level of the +0.9% / -0.7% sympathetic companion strings.', fmtPct),
      p(3, 'TONE', 60, 30, 100, 'Hz', 'one-pole', 'String bridge damping low-pass (400 Hz–14 kHz).', (v) => fmtTone44k(v, 2800, 30500)),
    ],
    presets: [
      { name: 'RM_HOME', params: [35, 60, 40, 60], mix: 0.75 },
      { name: 'Sitar Drone', params: [30, 86, 85, 78], mix: 0.8 },
      { name: 'Muted Pluck', params: [55, 32, 25, 38], mix: 0.7 },
    ],
  },
  {
    id: 9,
    slug: 'vowel',
    symbol: 'VO',
    name: 'VOWEL',
    origin: 'norilsk',
    category: 'spectral',
    tagline: '3-formant vocal tract filter morphing A → E → I → O → U',
    description:
      'Three parallel vocal formant resonators morphing continuously across A-E-I-O-U with ±0.5 octave formant shift, high Q (10–60), and tanh input drive.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_vow',
    cStruct: 'm_vow_t',
    stateBytes: 104,
    internalRateHz: 44100,
    storageFormat: '3× Q28 formant resonators',
    portability: 'verified',
    params: [
      p(0, 'VOWEL', 50, 0, 100, '', 'linear', 'Morph continuously across A, E, I, O, U formants.', (v) => {
        const vowels = ['A', 'E', 'I', 'O', 'U'];
        const idx = Math.min(4, Math.round((v / 100) * 4));
        return `${vowels[idx]} (${v})`;
      }),
      p(1, 'SHIFT', 50, 0, 100, 'st', 'linear', 'Formant frequency scale (-6 to +6 semitones).', (v) => `${((v - 50) * 0.12).toFixed(1)} st`),
      p(2, 'Q', 50, 10, 90, 'Q', 'linear', 'Formant sharpness (Q 10–60).', (v) => `Q ${10 + Math.round(v * 0.5)}`),
      p(3, 'DRIVE', 30, 0, 80, '×', 'linear', 'Input drive into vocal tract (2×–16× tanh).', fmtMult(2, 16)),
    ],
    presets: [
      { name: 'RM_HOME', params: [50, 50, 50, 30], mix: 0.9 },
      { name: 'Choir Aah', params: [5, 52, 65, 35], mix: 0.9 },
      { name: 'Dark Ooh', params: [95, 35, 72, 48], mix: 0.9 },
    ],
  },
  {
    id: 10,
    slug: 'spring',
    symbol: 'SP',
    name: 'SPRING',
    origin: 'norilsk',
    category: 'time',
    tagline: 'Dispersive spring tank with 6-stage Schroeder chirp allpass chain',
    description:
      'Full-rate 44.1 kHz spring reverb model: input resonator feeds a 30–120 ms tank loop containing six short Schroeder allpasses that create classic metallic dispersion chirps.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_spr',
    cStruct: 'm_spr_t',
    stateBytes: 11712,
    internalRateHz: 44100,
    storageFormat: '16-bit tank (5,300) + 6 allpasses',
    portability: 'verified',
    params: [
      p(0, 'CHIRP', 50, 0, 100, '%', 'linear', 'Allpass dispersion gain (0.30–0.75, spring boing).', (v) => `${Math.round(30 + v * 0.45)}%`),
      p(1, 'TANK', 40, 0, 100, 'ms', 'linear', 'Spring tank delay length (30–120 ms).', (v) => `${30 + Math.round(v * 0.9)} ms`),
      p(2, 'DECAY', 50, 35, 92, '%', 'linear', 'Tank feedback loop gain (20–93%).', (v) => `${Math.round(20 + v * 0.73)}%`),
      p(3, 'TONE', 50, 10, 60, 'Hz', 'linear', 'Input spring resonance colour (400 Hz–5.9 kHz).', (v) => fmtHz(400 + v * 55)),
    ],
    presets: [
      { name: 'RM_HOME', params: [50, 40, 50, 50], mix: 0.6 },
      { name: 'Surf Boing', params: [84, 65, 78, 36], mix: 0.65 },
      { name: 'Tight Box', params: [42, 18, 52, 28], mix: 0.55 },
    ],
  },
  {
    id: 11,
    slug: 'cloud',
    symbol: 'CL',
    name: 'CLOUD',
    origin: 'norilsk',
    category: 'glitch',
    tagline: '6-voice Hann granular cloud & real-time buffer freezer',
    description:
      'Records into a 0.74 s 8-bit μ-law line at 22.05 kHz and spawns up to 6 overlapping Hann-windowed grains (30–250 ms) at 3–60 grains/s. Above 50%, FREEZE locks the captured buffer.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_cld',
    cStruct: 'm_cld_t',
    stateBytes: 16488,
    internalRateHz: 22050,
    storageFormat: '8-bit μ-law · 16,384 samp + 6 grains',
    portability: 'verified',
    params: [
      p(0, 'SIZE', 55, 10, 100, 'ms', 'linear', 'Hann grain duration (30–250 ms).', (v) => `${30 + Math.round(v * 2.2)} ms`),
      p(1, 'DENSITY', 45, 10, 100, '/s', 'linear', 'Grain spawn density (3–60 grains/sec).', (v) => `${3 + Math.round(v * 0.57)}/s`),
      p(2, 'FREEZE', 20, 0, 100, '', 'stepped', 'Freezes buffer recording at >= 50 once filled.', (v) => (v >= 50 ? 'FROZEN' : 'Live')),
      p(3, 'SPREAD', 50, 10, 100, 'ms', 'linear', 'Random read-position scatter range (50–700 ms).', (v) => `${50 + Math.round(v * 6.5)} ms`),
    ],
    presets: [
      { name: 'RM_HOME', params: [55, 45, 20, 50], mix: 0.75 },
      { name: 'Frozen Pad', params: [82, 72, 75, 70], mix: 0.85 },
      { name: 'Fine Mist', params: [18, 88, 10, 45], mix: 0.7 },
    ],
  },
  {
    id: 12,
    slug: 'scream',
    symbol: 'SC',
    name: 'SCREAM',
    origin: 'norilsk',
    category: 'drive',
    tagline: 'No-input 4×4 Hadamard saturated feedback delay network',
    description:
      'Four prime-length delay lines (1–23 ms) cross-coupled through an energy-preserving 4×4 Hadamard matrix and per-line tanh saturation, level-gated by the input envelope so silence dies naturally.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_scr',
    cStruct: 'm_scr_t',
    stateBytes: 8224,
    internalRateHz: 44100,
    storageFormat: '4× 1,024-samp int16 Hadamard FDN',
    portability: 'verified',
    params: [
      p(0, 'SIZE', 50, 0, 100, 'ms', 'linear', 'Prime delay line scale (1–23 ms).', (v) => `${(1 + v * 0.22).toFixed(1)} ms`),
      p(1, 'FEEDBACK', 60, 25, 92, '%', 'linear', 'Saturated loop gain (60–105%, held by tanh).', (v) => `${Math.round(60 + v * 0.45)}%`),
      p(2, 'TONE', 45, 10, 90, 'Hz', 'one-pole', 'In-loop damping low-pass filter.', (v) => fmtTone44k(v, 2000, 30000)),
      p(3, 'DRIVE', 50, 10, 100, '×', 'linear', 'Input injection drive into the FDN (0.5×–6.5×).', fmtMult(0.5, 6.5)),
    ],
    presets: [
      { name: 'RM_HOME', params: [50, 60, 45, 50], mix: 0.7 },
      { name: 'Mixer Howl', params: [28, 88, 62, 72], mix: 0.75 },
      { name: 'Dark Cavity', params: [82, 72, 24, 55], mix: 0.7 },
    ],
  },
  {
    id: 13,
    slug: 'ring',
    symbol: 'RI',
    name: 'RING',
    origin: 'norilsk',
    category: 'drive',
    tagline: 'Julian Parker diode ring modulator with self-carrier delay mode',
    description:
      'Blends ideal four-quadrant multiplication with a physical square-law diode bridge model. Carrier can be a 30–1450 Hz sine or crossfaded into the sound’s own 23 ms delayed past (SELF).',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_rng',
    cStruct: 'm_rng_t',
    stateBytes: 1048,
    internalRateHz: 44100,
    storageFormat: 'Diode bridge + 23 ms μ-law self-line',
    portability: 'verified',
    params: [
      p(0, 'FREQ', 45, 0, 100, 'Hz', 'log', 'Carrier oscillator frequency (30–1450 Hz).', fmtLogHz(30, 5.58)),
      p(1, 'DIODE', 50, 0, 100, '%', 'linear', 'Blend from ideal multiplier to nonlinear diode bridge.', fmtPct),
      p(2, 'SELF', 20, 0, 90, '%', 'linear', 'Replace carrier with 23 ms delayed input signal.', fmtPct),
      p(3, 'TONE', 60, 20, 100, 'Hz', 'one-pole', 'Post-modulation low-pass tone.', (v) => fmtTone44k(v, 3000, 31000)),
    ],
    presets: [
      { name: 'RM_HOME', params: [45, 50, 20, 60], mix: 0.8 },
      { name: 'Dalek Bell', params: [62, 75, 0, 80], mix: 0.85 },
      { name: 'Self-Mod', params: [30, 80, 85, 65], mix: 0.8 },
    ],
  },
  {
    id: 14,
    slug: 'starve',
    symbol: 'SV',
    name: 'STARVE',
    origin: 'norilsk',
    category: 'drive',
    tagline: 'Starved-voltage gated velcro fuzz with sagging supply bias',
    description:
      'Extreme 20–60 dB gain into an asymmetric clipper whose supply bias sags dynamically with signal level, paired with a hysteretic noise gate that tears tails into velcro sputter.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_stv',
    cStruct: 'm_stv_t',
    stateBytes: 24,
    internalRateHz: 44100,
    storageFormat: 'Asymmetric clipper + gate + DC block',
    portability: 'verified',
    params: [
      p(0, 'GAIN', 60, 20, 100, 'dB', 'log', 'Pre-clipper fuzz gain (+20 to +60 dB).', (v) => `+${(20 + v * 0.4).toFixed(0)} dB`),
      p(1, 'GATE', 30, 0, 70, '%', 'linear', 'Hysteretic velcro sputter gate threshold.', fmtPct),
      p(2, 'BIAS', 35, 0, 100, '%', 'linear', 'Starved transistor bias offset (sags on peaks).', fmtPct),
      p(3, 'TONE', 55, 20, 100, 'Hz', 'one-pole', 'Post-fuzz low-pass filter.', (v) => fmtTone44k(v, 1400, 30000)),
    ],
    presets: [
      { name: 'RM_HOME', params: [60, 30, 35, 55], mix: 0.85 },
      { name: 'Velcro Tear', params: [82, 54, 68, 48], mix: 0.9 },
      { name: 'Dying Cell', params: [48, 42, 85, 36], mix: 0.8 },
    ],
  },
  {
    id: 15,
    slug: 'cheb',
    symbol: 'CB',
    name: 'CHEB',
    origin: 'norilsk',
    category: 'drive',
    tagline: '8th-order Chebyshev polynomial harmonic re-voicer',
    description:
      'Normalizes signal envelope into an 8-term Chebyshev polynomial bank (T1–T8) morphing across Rich, Hollow, Glass, and Growl spectra with independent odd/even harmonic tilt.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_chb',
    cStruct: 'm_chb_t',
    stateBytes: 16,
    internalRateHz: 44100,
    storageFormat: 'T1–T8 recurrence + env match',
    portability: 'verified',
    params: [
      p(0, 'SHAPE', 40, 0, 100, '', 'linear', 'Morphs across Rich → Hollow → Glass → Growl spectra.', (v) => (v < 25 ? 'Rich' : v < 50 ? 'Hollow' : v < 75 ? 'Glass' : 'Growl')),
      p(1, 'ODD', 50, 0, 100, '%', 'linear', 'Balances even vs odd Chebyshev harmonics.', fmtPct),
      p(2, 'DRIVE', 60, 20, 100, '%', 'linear', 'Target polynomial excitation amplitude (0.30–0.98).', (v) => `${Math.round(30 + v * 0.68)}%`),
      p(3, 'TONE', 60, 20, 100, 'Hz', 'one-pole', 'Post-waveshaper low-pass filter.', (v) => fmtTone44k(v, 3000, 31000)),
    ],
    presets: [
      { name: 'RM_HOME', params: [40, 50, 60, 60], mix: 0.8 },
      { name: 'Glass Bells', params: [68, 40, 82, 85], mix: 0.8 },
      { name: 'Hollow Reed', params: [33, 88, 70, 52], mix: 0.85 },
    ],
  },
  {
    id: 16,
    slug: 'bank',
    symbol: 'BK',
    name: 'BANK',
    origin: 'norilsk',
    category: 'spectral',
    tagline: '8-mode physical resonator bank (Bar, Plate, Bell, Membrane)',
    description:
      'Eight Q28 error-feedback resonators tuned to acoustic eigenmode ratios of a Free Bar, Plate, Bell, or Membrane anchored to the Root Note with Q 30–400.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_bnk',
    cStruct: 'm_bnk_t',
    stateBytes: 296,
    internalRateHz: 44100,
    storageFormat: '8× Q28 error-feedback resonators',
    usesRootNote: true,
    portability: 'verified',
    params: [
      p(0, 'PITCH', 40, 0, 100, 'oct', 'stepped', 'Fundamental octave above scale root (C2–B4).', (v) => `+${Math.floor((v * 3) / 101)} oct`),
      p(1, 'Q / RING', 60, 25, 95, 'Q', 'log', 'Modal ring sharpness (Q 30–400).', (v) => `Q ${Math.round(30 * Math.pow(2, (v * 3.74) / 100))}`),
      p(2, 'SET', 30, 0, 100, '', 'stepped', 'Physical mode table: Bar, Plate, Bell, or Membrane.', (v) => ['Free Bar', 'Plate', 'Bell', 'Membrane'][Math.min(3, Math.floor((v * 3) / 100))]),
      p(3, 'BRIGHT', 50, 10, 100, '%', 'linear', 'Upper mode damping / brightness tilt.', fmtPct),
    ],
    presets: [
      { name: 'RM_HOME', params: [40, 60, 30, 50], mix: 0.8 },
      { name: 'Bronze Bell', params: [50, 82, 68, 72], mix: 0.85 },
      { name: 'Timpani', params: [15, 55, 98, 40], mix: 0.8 },
    ],
  },
  {
    id: 17,
    slug: 'smear',
    symbol: 'SM',
    name: 'SMEAR',
    origin: 'norilsk',
    category: 'time',
    tagline: '20-tap velvet-noise decorrelator for transient smoke & halo',
    description:
      'Convolves audio with 20 deterministic bipolar velvet-noise impulses across 12–46 ms with decaying tap envelope. Zero feedback: turns sharp attacks into airy smoke.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_smr',
    cStruct: 'm_smr_t',
    stateBytes: 4208,
    internalRateHz: 44100,
    storageFormat: '2,048-samp int16 FIR · 20 velvet taps',
    portability: 'verified',
    params: [
      p(0, 'SPAN', 60, 0, 100, 'ms', 'linear', 'Velvet-noise impulse span (12–46 ms).', (v) => `${Math.round(12 + v * 0.34)} ms`),
      p(1, 'TAIL', 40, 0, 100, '%', 'linear', 'Tap decay slope from flat (0) to steep (100).', fmtPct),
      p(2, 'SMEAR', 70, 30, 100, '%', 'linear', 'Internal velvet mix (40–100%).', (v) => `${Math.round(40 + v * 0.6)}%`),
      p(3, 'TONE', 55, 20, 100, 'Hz', 'one-pole', 'Post-smear low-pass filter.', (v) => fmtTone44k(v, 1400, 30000)),
    ],
    presets: [
      { name: 'RM_HOME', params: [60, 40, 70, 55], mix: 0.75 },
      { name: 'Smoke Halo', params: [92, 25, 95, 62], mix: 0.8 },
      { name: 'Tight Brush', params: [20, 65, 65, 78], mix: 0.7 },
    ],
  },
  {
    id: 18,
    slug: 'diffuse',
    symbol: 'DF',
    name: 'DIFFUSE',
    origin: 'norilsk',
    category: 'time',
    tagline: '4-stage Schroeder allpass diffuser (Clouds topology at 44.1 kHz)',
    description:
      'Four cascaded allpasses (174, 248, 371, 612 samples) blur sharp edges and transients into soft liquid washes without adding a long reverb tail.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_dif',
    cStruct: 'm_dif_t',
    stateBytes: 2864,
    internalRateHz: 44100,
    storageFormat: '4× allpasses (1,405 int16 total)',
    portability: 'verified',
    params: [
      p(0, 'SIZE', 60, 0, 100, '%', 'linear', 'Allpass delay length scale (40–100%).', (v) => `${Math.round(40 + v * 0.6)}%`),
      p(1, 'DIFFUSE', 55, 0, 100, '%', 'linear', 'Allpass coefficient κ (0.40–0.75).', (v) => `${Math.round(40 + v * 0.35)}%`),
      p(2, 'DEPTH', 70, 30, 100, '%', 'linear', 'Internal diffused blend (50–100%).', (v) => `${Math.round(50 + v * 0.5)}%`),
      p(3, 'TONE', 60, 20, 100, 'Hz', 'one-pole', 'Post-diffuser low-pass tone.', (v) => fmtTone44k(v, 1400, 30000)),
    ],
    presets: [
      { name: 'RM_HOME', params: [60, 55, 70, 60], mix: 0.75 },
      { name: 'Soft Cloud', params: [95, 88, 95, 58], mix: 0.85 },
      { name: 'Phase Blur', params: [28, 72, 80, 82], mix: 0.7 },
    ],
  },
  {
    id: 19,
    slug: 'slew',
    symbol: 'SW',
    name: 'SLEW',
    origin: 'norilsk',
    category: 'drive',
    tagline: 'Hard slew-rate limiter turning transients into dark grinding ramps',
    description:
      'Caps per-sample amplitude delta (40–4000 Q15/sample) after input drive (1×–8×), transforming bright harmonics and attacks into heavy triangular distortion.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_slw',
    cStruct: 'm_slw_t',
    stateBytes: 40,
    internalRateHz: 44100,
    storageFormat: 'Slew integrator + tanh + LP',
    portability: 'verified',
    params: [
      p(0, 'RATE', 35, 0, 85, 'step', 'log', 'Maximum sample-to-sample step (40–4000 Q15).', (v) => `${Math.round(40 * Math.pow(100, v / 100))}`),
      p(1, 'DRIVE', 40, 0, 100, '×', 'linear', 'Input drive into slew limiter (1×–8×).', fmtMult(1, 8)),
      p(2, 'DEPTH', 70, 30, 100, '%', 'linear', 'Internal slewed blend (30–100%).', (v) => `${Math.round(30 + v * 0.7)}%`),
      p(3, 'TONE', 60, 15, 100, 'Hz', 'one-pole', 'Post-slew low-pass tone.', (v) => fmtTone44k(v, 1400, 30000)),
    ],
    presets: [
      { name: 'RM_HOME', params: [35, 40, 70, 60], mix: 0.85 },
      { name: 'Treacle Grind', params: [12, 78, 95, 48], mix: 0.9 },
      { name: 'Warm Edge', params: [62, 35, 55, 72], mix: 0.75 },
    ],
  },
  {
    id: 20,
    slug: 'xor',
    symbol: 'XO',
    name: 'XOR',
    origin: 'norilsk',
    category: 'drive',
    tagline: 'Bitwise logic combiner (XOR / AND / OR) against delayed self',
    description:
      'Quantizes audio to 3–10 bits and combines each sample bit-by-bit (XOR, AND, or OR) with a copy 0.1–23 ms earlier, creating fractured digital sidebands that track input dynamics.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_xor',
    cStruct: 'm_xor_t',
    stateBytes: 2096,
    internalRateHz: 44100,
    storageFormat: '1,024-samp int16 delay + bit logic',
    portability: 'verified',
    params: [
      p(0, 'DELAY', 40, 0, 100, 'ms', 'linear', 'Self-combination delay offset (0.1–23 ms).', (v) => `${(0.1 + v * 0.23).toFixed(1)} ms`),
      p(1, 'OP', 15, 0, 100, '', 'stepped', 'Bitwise logic operator: XOR, AND, or OR.', (v) => (v < 34 ? 'XOR (^)' : v < 67 ? 'AND (&)' : 'OR (|)')),
      p(2, 'BITS', 45, 0, 90, 'bit', 'stepped', 'Quantization bits kept (3–10 bits; fewer = harsher).', (v) => `${3 + Math.floor((v * 7) / 100)} bits`),
      p(3, 'TONE', 45, 20, 85, 'Hz', 'one-pole', 'Post-logic low-pass filter.', (v) => fmtTone44k(v, 1400, 30000)),
    ],
    presets: [
      { name: 'RM_HOME', params: [40, 15, 45, 45], mix: 0.75 },
      { name: 'AND Chop', params: [65, 50, 28, 58], mix: 0.8 },
      { name: 'Bit Ring', params: [12, 10, 62, 65], mix: 0.75 },
    ],
  },
  {
    id: 21,
    slug: 'dust',
    symbol: 'DS',
    name: 'DUST',
    origin: 'norilsk',
    category: 'drive',
    tagline: 'Slope-tracking tape dust, oxide hiss & dynamic vinyl crackle',
    description:
      'Generates hiss and ~600 Hz sparse micro-crackle modulated strictly by the input waveform’s slew/slope — completely silent when nothing moves, alive on every transient.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_dst',
    cStruct: 'm_dst_t',
    stateBytes: 56,
    internalRateHz: 44100,
    storageFormat: 'Slope follower + PRNG dust',
    portability: 'verified',
    params: [
      p(0, 'GRAIN', 40, 0, 100, '%', 'linear', 'Texture from continuous oxide hiss (0) to crackle (100).', fmtPct),
      p(1, 'AMOUNT', 40, 0, 85, '×', 'linear', 'Dust & crackle amplification (1×–8×).', fmtMult(1, 8)),
      p(2, 'TONE', 45, 15, 90, 'Hz', 'one-pole', 'Dust low-pass colour (300 Hz–16 kHz).', (v) => fmtTone44k(v, 1400, 30000)),
      p(3, 'DRY', 70, 30, 100, '%', 'linear', 'Original signal level kept underneath the dust.', fmtPct),
    ],
    presets: [
      { name: 'RM_HOME', params: [40, 40, 45, 70], mix: 0.85 },
      { name: '78 RPM', params: [85, 62, 58, 65], mix: 0.9 },
      { name: 'Tape Hiss', params: [10, 48, 36, 75], mix: 0.8 },
    ],
  },
  {
    id: 22,
    slug: 'waveset',
    symbol: 'WS',
    name: 'WAVESET',
    origin: 'norilsk',
    category: 'glitch',
    tagline: 'Trevor Wishart real-time zero-crossing waveset distortion',
    description:
      'Slices audio at upward zero-crossings into pseudo-cycles (up to 5.8 ms) and groups 1–8 wavesets to Repeat, Reverse, Shuffle, or Omit them with click-free 8-sample edge fades.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_wst',
    cStruct: 'm_wst_t',
    stateBytes: 8560,
    internalRateHz: 44100,
    storageFormat: '4,096-samp int16 + 64-crossing queue',
    portability: 'verified',
    params: [
      p(0, 'MODE', 50, 0, 100, '', 'stepped', 'Rearrangement mode: Repeat, Reverse, Shuffle, or Omit.', (v) => ['Repeat', 'Reverse', 'Shuffle', 'Omit'][Math.min(3, Math.floor(v / 25))]),
      p(1, 'GROUP', 30, 0, 100, 'ws', 'stepped', 'Consecutive wavesets per group (1–8).', (v) => `${1 + Math.floor((v * 7) / 100)} ws`),
      p(2, 'AMOUNT', 50, 10, 100, '%', 'linear', 'Repeat count, shuffle reach, or reverse/omit probability.', fmtPct),
      p(3, 'SHORTEST', 30, 0, 100, 'ms', 'linear', 'Minimum waveset duration (0.1–3.0 ms; merges hiss).', (v) => `${((4 + (v * 128) / 100) / 44.1).toFixed(2)} ms`),
    ],
    presets: [
      { name: 'RM_HOME', params: [50, 30, 50, 30], mix: 0.9 },
      { name: 'Stutter Rep', params: [10, 45, 72, 25], mix: 0.9 },
      { name: 'Omit Drops', params: [88, 25, 65, 35], mix: 0.9 },
    ],
  },
  {
    id: 23,
    slug: 'xmod',
    symbol: 'XM',
    name: 'XMOD',
    origin: 'norilsk',
    category: 'drive',
    tagline: 'Warps-inspired self cross-modulation (Fold, Diode Ring, Compare)',
    description:
      'Cross-modulates the live signal against a 1–40 ms delayed copy of itself via Wavefolder, Diode/Square Ring, or 4-stage Comparator logic. Crossfades cleanly on delay changes.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_xmd',
    cStruct: 'm_xmd_t',
    stateBytes: 4168,
    internalRateHz: 44100,
    storageFormat: '2,048-samp int16 self-delay + XMOD',
    portability: 'verified',
    params: [
      p(0, 'ALGO', 50, 0, 100, '', 'stepped', 'Cross-mod algorithm: Fold, Diode Ring, or Comparator.', (v) => ['Fold', 'Diode Ring', 'Compare'][Math.min(2, Math.floor(v / 34))]),
      p(1, 'AMOUNT', 50, 0, 100, '%', 'linear', 'Modulation depth / fold gain / comparator morph.', fmtPct),
      p(2, 'DELAY', 30, 0, 100, 'ms', 'linear', 'Self-modulator copy delay (1–40 ms).', (v) => `${(1 + v * 0.39).toFixed(1)} ms`),
      p(3, 'TONE', 60, 20, 100, 'Hz', 'one-pole', 'Post-modulation low-pass tone.', (v) => fmtTone44k(v, 1400, 30000)),
    ],
    presets: [
      { name: 'RM_HOME', params: [50, 50, 30, 60], mix: 0.85 },
      { name: 'Self Fold', params: [10, 70, 22, 65], mix: 0.85 },
      { name: 'Comparator', params: [85, 64, 48, 55], mix: 0.85 },
    ],
  },
  {
    id: 24,
    slug: 'chaos',
    symbol: 'CS',
    name: 'CHAOS',
    origin: 'norilsk',
    category: 'dynamics',
    tagline: 'Duffing double-well chaotic oscillator driven by input audio',
    description:
      'Integrates x″ = −d·x′ + x − x³ + g·in in Q24 semi-implicit Euler (2× oversampled). Light drive rings gently in one well; higher drive period-doubles and hops chaotically between wells.',
    sourceFile: 'core/vendor/norilsk/effects.c',
    cFunction: 'm_chs',
    cStruct: 'm_chs_t',
    stateBytes: 64,
    internalRateHz: 44100,
    storageFormat: 'Q24 2× Duffing integrator',
    portability: 'verified',
    params: [
      p(0, 'DRIVE', 50, 0, 100, '', 'linear', 'Forcing amplitude g (0.25–1.80: ring → period-2 → chaos).', (v) => (0.25 + v * 0.0155).toFixed(2)),
      p(1, 'DAMP', 40, 0, 100, '', 'linear', 'Oscillator damping d (0.04–0.90).', (v) => (0.04 + v * 0.0086).toFixed(2)),
      p(2, 'SCALE', 40, 0, 100, 'Hz', 'log', 'Natural well resonance frequency (60–800 Hz).', fmtLogHz(60, 3.73)),
      p(3, 'TONE', 60, 20, 100, 'Hz', 'one-pole', 'Post-oscillator low-pass tone.', (v) => fmtTone44k(v, 1400, 30000)),
    ],
    presets: [
      { name: 'RM_HOME', params: [50, 40, 40, 60], mix: 0.8 },
      { name: 'Well Hop', params: [88, 22, 48, 68], mix: 0.85 },
      { name: 'Sub Warmth', params: [24, 58, 22, 50], mix: 0.75 },
    ],
  },

  /* ===================== 25..26: TONITOR HEAVY STEREO EFFECTS ===================== */
  {
    id: 25,
    slug: 'delay',
    symbol: 'DL',
    name: 'DELAY',
    origin: 'tonitor',
    category: 'time',
    tagline: 'Tonitor 2.0-second log-scaled μ-law delay with tape-glide pitch bend',
    description:
      'Original Tonitor master delay running at 22.05 kHz in 8-bit μ-law (44,100-byte line). Time spans 20 ms–2.0 s logarithmically with smooth ~0.1 s glide that bends echoes like tape.',
    sourceFile: 'core/vendor/tonitor/delay.c',
    cFunction: 'dl_block',
    cStruct: 'dl_a[44100]',
    stateBytes: 44116,
    internalRateHz: 22050,
    storageFormat: '8-bit μ-law · 44,100 samp (2.0 s)',
    portability: 'verified',
    params: [
      p(0, 'TIME', 65, 20, 90, 'ms', 'log', 'Log-scaled delay time (20 ms–2,000 ms, tape glide).', (v) => `${Math.round(20 * Math.pow(100, v / 100))} ms`),
      p(1, 'FEEDBACK', 40, 20, 75, '%', 'linear', 'Damped regeneration up to 95%.', (v) => `${Math.round(v * 0.95)}%`),
      p(2, 'DAMP', 40, 20, 80, '%', 'linear', 'Echo high-frequency damping (0–88%).', fmtPct),
      p(3, 'RETURN', 60, 30, 70, '%', 'linear', 'Internal delay echo return level.', fmtPct),
    ],
    presets: [
      { name: 'RM_HOME', params: [65, 40, 40, 60], mix: 0.6 },
      { name: 'Dub Cavern', params: [76, 72, 62, 75], mix: 0.65 },
      { name: 'Short Slap', params: [32, 30, 35, 65], mix: 0.5 },
    ],
  },
  {
    id: 26,
    slug: 'reverb',
    symbol: 'RV',
    name: 'REVERB',
    origin: 'tonitor',
    category: 'time',
    tagline: 'Tonitor Dattorro figure-8 plate reverb (true 14-tap stereo tank)',
    description:
      'True stereo Jon Dattorro (1997) plate reverb running at 22.05 kHz in 16-bit fixed point (43.2 KiB): 20 ms predelay, 4 input diffusers, dual LFO-modulated figure-8 tank, and 14 stereo output taps.',
    sourceFile: 'core/vendor/tonitor/reverb.c',
    cFunction: 'rv_block',
    cStruct: 'rv_mem[21600]',
    stateBytes: 43452,
    internalRateHz: 22050,
    storageFormat: '16-bit Dattorro tank · 14 stereo taps',
    trueStereo: true,
    portability: 'verified',
    params: [
      p(0, 'SIZE', 65, 40, 100, '%', 'linear', 'Tank delay scale (0.50×–1.25× Dattorro, smooth glide).', (v) => `${(0.5 + v * 0.0075).toFixed(2)}×`),
      p(1, 'DECAY', 60, 40, 95, 's', 'log', 'Calibrated RT60 decay time (0.4 s–25.6 s).', (v) => `${(0.4 * Math.pow(2, (v * 6) / 100)).toFixed(1)} s`),
      p(2, 'DAMP', 40, 20, 70, '%', 'linear', 'High-frequency tank absorption (5–90%).', fmtPct),
      p(3, 'RETURN', 55, 40, 85, '×', 'linear', 'Quadratic plate return gain (0×–4×; 1.0× at 50).', (v) => `${((v / 50) * (v / 50)).toFixed(2)}×`),
    ],
    presets: [
      { name: 'RM_HOME', params: [65, 60, 40, 55], mix: 0.55 },
      { name: 'Infinite Plate', params: [95, 92, 32, 68], mix: 0.65 },
      { name: 'Tight Studio', params: [32, 35, 52, 55], mix: 0.45 },
    ],
  },

  /* ===================== 27..45: 19 MOLECULAR OWN ATOMS (core/atoms.c) ===================== */
  {
    id: 27,
    slug: 'spiral',
    symbol: 'SR',
    name: 'SPIRAL',
    origin: 'molecular',
    category: 'time',
    tagline: 'H910 / GRM PitchAccum pitch-shifter inside a feedback delay',
    description:
      'Dual-head fractional pitch shifter (-12 to +12 semitones) inside a 20–110 ms feedback loop so every repeat transposes again into ascending or descending Shepard staircases.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_spiral',
    cStruct: 'nx_spiral_t',
    stateBytes: 16464,
    internalRateHz: 44100,
    storageFormat: '8,192-samp int16 ring + 2 heads',
    portability: 'verified',
    params: [
      p(0, 'INTERVAL', 62, 0, 100, 'st', 'linear', 'Pitch shift per repeat (-12 to +12 semitones).', (v) => `${((v - 50) * 0.24).toFixed(1)} st`),
      p(1, 'FEEDBACK', 55, 20, 85, '%', 'linear', 'Spiral feedback regeneration (0–95%).', (v) => `${Math.round(v * 0.95)}%`),
      p(2, 'TIME', 45, 10, 100, 'ms', 'linear', 'Delay time between transposed steps (20–110 ms).', (v) => `${Math.round(20 + v * 0.9)} ms`),
      p(3, 'SPLICE', 25, 0, 100, '%', 'linear', 'Window crossfade sharpness + H910 glitch jitter (>60).', fmtPct),
    ],
    presets: [
      { name: 'HOME', params: [62, 55, 45, 25], mix: 0.65 },
      { name: 'Fifth Climb', params: [79, 68, 55, 20], mix: 0.7 },
      { name: 'Dark Descent', params: [25, 65, 65, 72], mix: 0.7 },
    ],
  },
  {
    id: 28,
    slug: 'source',
    symbol: 'SO',
    name: 'SOURCE',
    origin: 'molecular',
    category: 'spectral',
    tagline: 'IRCAM-style 16th-order Levinson-Durbin LPC source-filter resynthesis',
    description:
      'Extracts the sound’s vocal/spectral envelope via 256-sample Hann autocorrelation and Levinson-Durbin LPC (order 4–16), then excites that body with residual, noise, or a sawtooth tuned to Root.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_source',
    cStruct: 'nx_source_t',
    stateBytes: 960,
    internalRateHz: 44100,
    storageFormat: '256-samp LPC lattice (order 4–16)',
    usesRootNote: true,
    portability: 'verified',
    params: [
      p(0, 'EXCITE', 65, 0, 100, '', 'linear', 'Excitation blend: Residual (0) → Noise (50) → Saw Buzz (100).', (v) => (v <= 50 ? `Res→Noise ${v * 2}%` : `Noise→Buzz ${(v - 50) * 2}%`)),
      p(1, 'BUZZ', 50, 10, 90, 'st', 'linear', 'Buzz sawtooth pitch offset around Root (-24 to +12 st).', (v) => `${Math.round(((v - 66) * 36) / 100 + 12)} st`),
      p(2, 'HOLD', 35, 0, 100, '%', 'linear', 'Spectral envelope glide smoothing (>=98 freezes body).', (v) => (v >= 98 ? 'FROZEN' : `${v}%`)),
      p(3, 'ORDER', 60, 30, 100, 'p', 'stepped', 'LPC reflection lattice order (4–16 poles).', (v) => `${4 + Math.floor((v * 12) / 100)} poles`),
    ],
    presets: [
      { name: 'HOME', params: [65, 50, 35, 60], mix: 0.85 },
      { name: 'Whisper Body', params: [50, 50, 45, 80], mix: 0.9 },
      { name: 'Robotic Buzz', params: [95, 42, 30, 75], mix: 0.9 },
    ],
  },
  {
    id: 29,
    slug: 'envel',
    symbol: 'EN',
    name: 'ENVEL',
    origin: 'molecular',
    category: 'dynamics',
    tagline: 'Schaeffer cloche coupée attack shaper & dynamic envelope inverter',
    description:
      'Dual fast/slow envelope followers reshape dynamics: below 50 shaves attacks into slow swells; above 50 sharpens transients (+12 dB); INVERT flips decays upward into rising swells.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_envel',
    cStruct: 'nx_envel_t',
    stateBytes: 64,
    internalRateHz: 44100,
    storageFormat: 'Q30 dual-rate envelope followers',
    portability: 'verified',
    params: [
      p(0, 'SHAPE', 25, 5, 95, '', 'linear', 'Below 50: remove attacks (swell); above 50: sharpen attacks.', (v) => (v < 48 ? `Swell ${50 - v}` : v > 52 ? `Sharp +${v - 50}` : 'Neutral')),
      p(1, 'TIME', 45, 10, 90, 'ms', 'log', 'Slow follower window (20 ms–2.0 s).', (v) => `${Math.round(20 * Math.pow(2, v * 0.067))} ms`),
      p(2, 'INVERT', 20, 0, 85, '%', 'linear', 'Envelope inversion depth (decays rise as swells).', fmtPct),
      p(3, 'FLOOR', 35, 25, 75, 'dB', 'linear', 'Noise gate floor for envelope inversion (-70 to -48 dB).', (v) => `${Math.round(-70 + v * 0.22)} dB`),
    ],
    presets: [
      { name: 'HOME', params: [25, 45, 20, 35], mix: 1.0 },
      { name: 'Cloche Coupée', params: [10, 58, 15, 35], mix: 1.0 },
      { name: 'Reverse Swell', params: [20, 50, 78, 45], mix: 1.0 },
    ],
  },
  {
    id: 30,
    slug: 'lpg',
    symbol: 'LG',
    name: 'LPG',
    origin: 'molecular',
    category: 'dynamics',
    tagline: 'Buchla 292 vactrol low-pass gate + 266 Source of Uncertainty',
    description:
      'Audio onsets strike a nonlinear vactrol decay curve (fast top, long natural tail) opening both a resonant low-pass and c^1.5 VCA, while UNCERTAINTY randomizes every strike’s decay and colour.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_lpg',
    cStruct: 'nx_lpg_t',
    stateBytes: 120,
    internalRateHz: 44100,
    storageFormat: 'SVF + nonlinear vactrol + 266 PRNG',
    portability: 'verified',
    params: [
      p(0, 'SENSE', 55, 20, 90, '%', 'linear', 'Onset trigger sensitivity (low = photocell level follow).', fmtPct),
      p(1, 'DECAY', 50, 10, 90, 'ms', 'linear', 'Base vactrol ring decay (50 ms–3.0 s).', (v) => `${Math.round(50 + v * v * 0.295)} ms`),
      p(2, 'COLOUR', 60, 10, 100, '%', 'linear', 'Vactrol cutoff reach (6–9 oct) and resonant ping (Q 0.7–2.2).', fmtPct),
      p(3, 'UNCERT', 40, 0, 100, '%', 'probabilistic', 'Buchla 266 per-strike decay & brightness randomization.', fmtPct),
    ],
    presets: [
      { name: 'HOME', params: [55, 50, 60, 40], mix: 1.0 },
      { name: 'Bongo Ping', params: [72, 24, 78, 55], mix: 1.0 },
      { name: 'Organic Tail', params: [42, 74, 52, 75], mix: 1.0 },
    ],
  },
  {
    id: 31,
    slug: 'barber',
    symbol: 'BA',
    name: 'BARBER',
    origin: 'molecular',
    category: 'time',
    tagline: '4-tap Shepard-Risset endlessly rising/falling barber-pole flanger',
    description:
      'Four staggered sin²-windowed delay taps sweep across a 1–10 ms comb continuously, creating the auditory illusion of spectral notches rising (RATE > 50) or falling (RATE < 50) forever.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_barber',
    cStruct: 'nx_barber_t',
    stateBytes: 2096,
    internalRateHz: 44100,
    storageFormat: '1,024-samp int16 ring · 4 sin² taps',
    portability: 'verified',
    params: [
      p(0, 'RATE', 65, 0, 100, 'Hz', 'linear', 'Sweep direction & speed (-1.0 to +1.0 Hz; 50 = static).', (v) => {
        const r = v - 50;
        const hz = (r * Math.abs(r) * 4) / 10000;
        return `${hz >= 0 ? '+' : ''}${hz.toFixed(2)} Hz`;
      }),
      p(1, 'RANGE', 55, 10, 100, 'ms', 'linear', 'Comb sweep depth (1–10 ms).', (v) => `${(1 + v * 0.09).toFixed(1)} ms`),
      p(2, 'FEEDBACK', 55, 15, 85, '%', 'linear', 'Bipolar comb feedback (-85% to +85%; 50 = 0).', (v) => `${Math.round(((v - 50) * 85) / 50)}%`),
      p(3, 'DEPTH', 70, 30, 100, '%', 'linear', 'Comb notch intensity (25–100%).', (v) => `${Math.round(25 + v * 0.75)}%`),
    ],
    presets: [
      { name: 'HOME', params: [65, 55, 55, 70], mix: 0.8 },
      { name: 'Endless Rise', params: [78, 65, 76, 85], mix: 0.85 },
      { name: 'Abyss Fall', params: [22, 80, 22, 85], mix: 0.85 },
    ],
  },
  {
    id: 32,
    slug: 'stick',
    symbol: 'SK',
    name: 'STICK',
    origin: 'molecular',
    category: 'dynamics',
    tagline: 'Physical stick-slip friction spring-mass oscillator (squeaks & creaks)',
    description:
      'Simulates a sprung mass resting on a moving belt driven by the audio waveform (Q24 physics). The mass sticks under static friction until spring tension breaks free into bowed chatter and creaks.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_stick',
    cStruct: 'nx_stick_t',
    stateBytes: 64,
    internalRateHz: 44100,
    storageFormat: 'Q24 stick-slip spring physics',
    portability: 'verified',
    params: [
      p(0, 'FRICTION', 45, 15, 90, '%', 'linear', 'Static/kinetic friction threshold (higher = harder catch).', fmtPct),
      p(1, 'SPRING', 50, 10, 90, 'Hz', 'log', 'Natural slipping resonance pitch (80 Hz–5.1 kHz).', fmtLogHz(80, 6)),
      p(2, 'DAMPING', 40, 10, 80, '%', 'linear', 'Mass-spring velocity damping.', fmtPct),
      p(3, 'DRIVE', 65, 30, 100, '%', 'linear', 'Belt velocity gain and envelope drag.', fmtPct),
    ],
    presets: [
      { name: 'HOME', params: [45, 50, 40, 65], mix: 0.8 },
      { name: 'Bowed Creak', params: [68, 35, 28, 78], mix: 0.85 },
      { name: 'Rust Hinge', params: [55, 72, 22, 82], mix: 0.85 },
    ],
  },
  {
    id: 33,
    slug: 'morpho',
    symbol: 'MP',
    name: 'MORPHO',
    origin: 'molecular',
    category: 'time',
    tagline: 'Poullin GRM Morphophone 6-band multiband dispersive delay',
    description:
      'Splits audio into 6 complementary bands (345–5520 Hz), each stored in its own decimated delay line with independent feedback. Fans sharp attacks out into upward or downward spectral chirps.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_morpho',
    cStruct: 'nx_morpho_t',
    stateBytes: 16352,
    internalRateHz: 44100,
    storageFormat: '6-band decimated lines (15.9 KiB)',
    portability: 'verified',
    params: [
      p(0, 'TIME', 60, 30, 100, 'ms', 'linear', 'Maximum inter-band dispersion spread (up to 740 ms).', (v) => `${Math.round(v * 7.4)} ms`),
      p(1, 'TILT', 30, 0, 100, '', 'linear', '0: lows arrive late (up-chirp); 100: highs arrive late.', (v) => (v < 45 ? `Lows Late (${50 - v})` : v > 55 ? `Highs Late (${v - 50})` : 'Flat')),
      p(2, 'FEEDBACK', 45, 0, 80, '%', 'linear', 'Per-band independent regeneration (0–90%).', (v) => `${Math.round(v * 0.9)}%`),
      p(3, 'SCATTER', 35, 0, 100, '%', 'linear', 'Randomizes band delay times away from tilt curve.', fmtPct),
    ],
    presets: [
      { name: 'HOME', params: [60, 30, 45, 35], mix: 0.8 },
      { name: 'Spectral Chirp', params: [85, 10, 62, 15], mix: 0.85 },
      { name: 'Prism Echo', params: [72, 75, 58, 70], mix: 0.8 },
    ],
  },
  {
    id: 34,
    slug: 'disintegrate',
    symbol: 'DI',
    name: 'DISINTEGRATE',
    origin: 'molecular',
    category: 'glitch',
    tagline: 'Cascaded level-pushed read heads (Airwindows Disintegrate topology)',
    description:
      'Up to 8 short delay rings in series where each read head is pushed backwards dynamically by the signal’s own amplitude and softly clamped — the louder the hit, the more it smears and fractures.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_disint',
    cStruct: 'nx_disint_t',
    stateBytes: 4168,
    internalRateHz: 44100,
    storageFormat: '8× 256-samp dynamic delay rings',
    portability: 'verified',
    params: [
      p(0, 'DRIVE', 55, 20, 100, '×', 'linear', 'Input drive into cascaded clipping windows (1×–5×).', fmtMult(1, 5)),
      p(1, 'LENGTH', 55, 20, 100, 'samp', 'linear', 'Max per-layer head excursion (8–248 samples).', (v) => `${8 + Math.round(v * 2.4)} samp`),
      p(2, 'LAYERS', 50, 10, 100, 'stg', 'stepped', 'Active serial disintegration layers (1–8).', (v) => `${1 + Math.floor((v * 7) / 100)} layers`),
      p(3, 'SMOOTH', 40, 10, 90, '%', 'linear', 'Read-head position smoothing inertia.', fmtPct),
    ],
    presets: [
      { name: 'HOME', params: [55, 55, 50, 40], mix: 0.85 },
      { name: 'Tape Shred', params: [78, 82, 85, 28], mix: 0.9 },
      { name: 'Soft Dissolve', params: [38, 45, 42, 72], mix: 0.8 },
    ],
  },
  {
    id: 35,
    slug: 'reed',
    symbol: 'RD',
    name: 'REED',
    origin: 'molecular',
    category: 'spectral',
    tagline: 'STK-style physical clarinet reed & bore blown by input audio',
    description:
      'Audio envelope and waveform blow a half-wave clarinet bore waveguide tuned to the Root Note, producing odd harmonics, multiphonics, overblowing, and squawks while the input plays.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_reed',
    cStruct: 'nx_reed_t',
    stateBytes: 4144,
    internalRateHz: 44100,
    storageFormat: '2,048-samp int16 bore waveguide',
    usesRootNote: true,
    portability: 'verified',
    params: [
      p(0, 'PITCH', 50, 10, 90, 'st', 'linear', 'Bore tuning offset around Root (-24 to +12 st).', (v) => `${Math.round(((v - 66) * 36) / 100 + 12)} st`),
      p(1, 'PRESSURE', 60, 30, 95, '%', 'linear', 'Breath pressure driving reed nonlinearity (0.49–1.10).', (v) => `${(0.49 + v * 0.0061).toFixed(2)}`),
      p(2, 'BRIGHT', 55, 20, 90, '%', 'linear', 'Bell reflection low-pass brightness.', fmtPct),
      p(3, 'DAMPING', 50, 20, 90, '%', 'linear', 'Bore reflection coefficient (0.85–0.98).', (v) => `${Math.round(85 + v * 0.13)}%`),
    ],
    presets: [
      { name: 'HOME', params: [50, 60, 55, 50], mix: 0.8 },
      { name: 'Multiphonic', params: [42, 88, 72, 78], mix: 0.85 },
      { name: 'Bass Clarinet', params: [22, 65, 35, 62], mix: 0.8 },
    ],
  },
  {
    id: 36,
    slug: 'nlf',
    symbol: 'NL',
    name: 'NLF',
    origin: 'molecular',
    category: 'drive',
    tagline: 'Dobson nonlinear quadratic-lag filter (y = a·y1 + b·y2 + d·y[n-L]² + x)',
    description:
      'Implements Richard Dobson’s classic Csound nlfilt difference equation in Q15: smoothly transitions from resonant colouring into self-modulating buzz, squeals, and level-gated chaos.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_nlf',
    cStruct: 'nx_nlf_t',
    stateBytes: 2104,
    internalRateHz: 44100,
    storageFormat: '1,024-samp int16 lag line + IIR',
    portability: 'verified',
    params: [
      p(0, 'FEEDBACK', 55, 20, 95, '', 'linear', 'First-order feedback coefficient a (0.00–0.88).', (v) => (v * 0.0088).toFixed(2)),
      p(1, 'RES', 45, 0, 100, '', 'linear', 'Second-order resonance b (-0.37 to +0.24).', (v) => (((v - 60) * 200) / 32768).toFixed(2)),
      p(2, 'NONLIN', 50, 10, 90, '%', 'linear', 'Quadratic lag nonlinearity d (level-scaled).', fmtPct),
      p(3, 'LAG', 45, 0, 100, 'samp', 'linear', 'Quadratic feedback lag L (1–590 samples).', (v) => `${1 + Math.floor((v * v) / 17)} samp`),
    ],
    presets: [
      { name: 'HOME', params: [55, 45, 50, 45], mix: 0.8 },
      { name: 'Buzz Drone', params: [78, 30, 76, 62], mix: 0.85 },
      { name: 'Reso Squeal', params: [85, 82, 60, 22], mix: 0.8 },
    ],
  },
  {
    id: 37,
    slug: 'subharm',
    symbol: 'SU',
    name: 'SUBHARM',
    origin: 'molecular',
    category: 'drive',
    tagline: 'Mixtur-Trautonium dual zero-crossing undertone divider',
    description:
      'Counts low-passed zero crossings with hysteresis to clock two independent frequency dividers (f/A and f/B, divisors 2–8), blending raw undertones with square-wave ring modulation.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_subharm',
    cStruct: 'nx_subharm_t',
    stateBytes: 120,
    internalRateHz: 44100,
    storageFormat: '2× SVF + dual flip-flop dividers',
    portability: 'verified',
    params: [
      p(0, 'DIV A', 35, 0, 100, '', 'stepped', 'First subharmonic divisor (÷2 to ÷8).', (v) => `÷${2 + Math.floor((v * 6) / 100)}`),
      p(1, 'DIV B', 65, 0, 100, '', 'stepped', 'Second subharmonic divisor (÷2 to ÷8).', (v) => `÷${2 + Math.floor((v * 6) / 100)}`),
      p(2, 'RING MIX', 40, 0, 100, '%', 'linear', 'Morphs from pure undertones (0) to ring-mod (100).', fmtPct),
      p(3, 'TONE', 60, 20, 100, 'Hz', 'linear', 'Output SVF low-pass cutoff (120 Hz–5.1 kHz).', (v) => fmtHz(120 + (v * v) / 2)),
    ],
    presets: [
      { name: 'HOME', params: [35, 65, 40, 60], mix: 0.75 },
      { name: 'Octave + 5th', params: [0, 35, 15, 55], mix: 0.75 },
      { name: 'Sub Ring', params: [18, 52, 85, 72], mix: 0.8 },
    ],
  },
  {
    id: 38,
    slug: 'spark',
    symbol: 'PK',
    name: 'SPARK',
    origin: 'molecular',
    category: 'drive',
    tagline: 'Zero-crossing electric arc & pitched impulse burst generator',
    description:
      'Every rising zero crossing above THRESHOLD fires a damped burst whose pitch falls as it dies (400 Hz–8 kHz), blending pitched sine arcs with white-noise crackle.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_spark',
    cStruct: 'nx_spark_t',
    stateBytes: 64,
    internalRateHz: 44100,
    storageFormat: 'Triggered falling-pitch burst',
    portability: 'verified',
    params: [
      p(0, 'PITCH', 50, 0, 100, 'Hz', 'log', 'Initial spark frequency (400 Hz–7.9 kHz).', fmtLogHz(400, 4.3)),
      p(1, 'DECAY', 45, 10, 90, 'ms', 'linear', 'Spark burst decay time (0.5–25 ms).', (v) => `${((22 + (v * v) / 9) / 44.1).toFixed(1)} ms`),
      p(2, 'GRIT', 45, 0, 100, '%', 'linear', 'Blend from tonal pulse (0) to noisy electric arc (100).', fmtPct),
      p(3, 'THRESH', 30, 0, 85, '%', 'linear', 'Minimum zero-crossing amplitude to fire a spark.', fmtPct),
    ],
    presets: [
      { name: 'HOME', params: [50, 45, 45, 30], mix: 0.75 },
      { name: 'Tesla Arc', params: [72, 22, 75, 20], mix: 0.8 },
      { name: 'Ping Train', params: [36, 70, 12, 35], mix: 0.8 },
    ],
  },
  {
    id: 39,
    slug: 'contrast',
    symbol: 'CT',
    name: 'CONTRAST',
    origin: 'molecular',
    category: 'spectral',
    tagline: '12-band GRM Contrast / CDP Trace spectral dynamics sculptor',
    description:
      'Splits audio across 12 band-passes (80 Hz–10 kHz) and applies power-law contrast (-1 turns tones to breath; +2 turns noise tonal) while TRACE keeps only the K loudest spectral bands.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_contrast',
    cStruct: 'nx_contrast_t',
    stateBytes: 512,
    internalRateHz: 44100,
    storageFormat: '12-band SVF bank (80 Hz–10 kHz)',
    portability: 'verified',
    params: [
      p(0, 'CONTRAST', 65, 0, 100, '', 'linear', 'Spectral exponent (-1.0 flatten → 0 → +2.0 sharpen).', (v) => `${((v - 33) / 33).toFixed(2)}`),
      p(1, 'TRACE', 30, 0, 85, 'bd', 'stepped', 'Keeps only the K loudest bands (12 down to 1).', (v) => `Top ${12 - Math.floor((v * 11) / 100)}`),
      p(2, 'RESO', 50, 10, 80, 'Q', 'linear', 'Band-pass filter sharpness (Q 1–5).', (v) => `Q ${(1 + v * 0.04).toFixed(1)}`),
      p(3, 'SPEED', 45, 10, 90, 'ms', 'linear', 'Band envelope follower time (5–180 ms).', (v) => `${Math.round((220 + v * 80) / 44.1)} ms`),
    ],
    presets: [
      { name: 'HOME', params: [65, 30, 50, 45], mix: 0.9 },
      { name: 'Top 3 Trace', params: [82, 78, 68, 35], mix: 0.95 },
      { name: 'Breath Flatten', params: [5, 0, 40, 55], mix: 0.9 },
    ],
  },
  {
    id: 40,
    slug: 'blur',
    symbol: 'BL',
    name: 'BLUR',
    origin: 'molecular',
    category: 'spectral',
    tagline: '12-band CDP spectral blur, evolution & slow-moving shadow resynthesis',
    description:
      'Tracks 12 spectral bands slowly (10 ms up to ~11 s with FREEZE) and resynthesizes the sound’s moving shadow using drifting sine oscillators, band-passed noise, or sparse dust grains.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_blur',
    cStruct: 'nx_blur_t',
    stateBytes: 840,
    internalRateHz: 44100,
    storageFormat: '12-band analyzer + sine/noise synth',
    portability: 'verified',
    params: [
      p(0, 'BLUR', 55, 10, 95, 'ms', 'log', 'Spectral follower smear time (10 ms–4.0 s).', (v) => `${Math.round(10 + v * v * 0.4)} ms`),
      p(1, 'FREEZE', 35, 0, 95, 's', 'log', 'Adds extra hold inertia (up to ~7 s spectral freeze).', (v) => `+${((v * v * v) / 125000).toFixed(1)} s`),
      p(2, 'EXCITE', 50, 0, 100, '', 'linear', 'Resynthesis source: Sines (0) → Noise (50) → Dust (100).', (v) => (v <= 50 ? `Sine→Noise ${v * 2}%` : `Noise→Dust ${(v - 50) * 2}%`)),
      p(3, 'DRIFT', 40, 0, 100, '%', 'linear', 'Random pitch wander on the 12 sine oscillators.', fmtPct),
    ],
    presets: [
      { name: 'HOME', params: [55, 35, 50, 40], mix: 0.8 },
      { name: 'Spectral Ghost', params: [82, 75, 22, 65], mix: 0.85 },
      { name: 'Wind Shadow', params: [68, 45, 65, 30], mix: 0.8 },
    ],
  },
  {
    id: 41,
    slug: 'doppler',
    symbol: 'DO',
    name: 'DOPPLER',
    origin: 'molecular',
    category: 'time',
    tagline: 'GRM / IRCAM orbiting acoustic Doppler pitch-bend, distance & air loss',
    description:
      'Places the sound on a virtual circular orbit (2–14 m radius). Acoustic propagation delay (d / 343 m/s) bends pitch smoothly while 1/d attenuation and air-absorption low-pass track proximity.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_doppler',
    cStruct: 'nx_doppler_t',
    stateBytes: 8256,
    internalRateHz: 44100,
    storageFormat: '4,096-samp int16 fractional delay',
    portability: 'verified',
    params: [
      p(0, 'SPEED', 45, 10, 90, 'Hz', 'linear', 'Orbit rotation speed (0.05–1.50 orbits/sec).', (v) => `${((13 + (v * v * 371) / 10000) / 256).toFixed(2)} Hz`),
      p(1, 'SIZE', 60, 20, 100, 'm', 'linear', 'Orbit radius (2–14 meters).', (v) => `${(2 + v * 0.12).toFixed(1)} m`),
      p(2, 'PASS', 65, 20, 100, '%', 'linear', 'Listener eccentricity (0 = centered; 100 = close flyby).', fmtPct),
      p(3, 'AIR', 40, 0, 100, '%', 'linear', 'Distance-dependent high-frequency air absorption.', fmtPct),
    ],
    presets: [
      { name: 'HOME', params: [45, 60, 65, 40], mix: 0.9 },
      { name: 'Fast Flyby', params: [78, 85, 92, 55], mix: 1.0 },
      { name: 'Slow Leslie', params: [32, 35, 55, 28], mix: 0.85 },
    ],
  },
  {
    id: 42,
    slug: 'gsm',
    symbol: 'GS',
    name: 'GSM',
    origin: 'molecular',
    category: 'glitch',
    tagline: 'Authentic 13 kbit/s GSM 06.10 mobile phone codec + frame stutter',
    description:
      'Runs the actual Degener/Bormann GSM 06.10 full-rate RPE-LTP speech codec in fixed-point C (160-sample frames) at decimated clock rates (14.7–5.5 kHz) with drive nonlinearities and dropped-frame stutter.',
    sourceFile: 'core/atoms.c + core/gsm.c',
    cFunction: 'nx_gsm',
    cStruct: 'nx_gsm_t',
    stateBytes: 2248,
    internalRateHz: 44100,
    storageFormat: 'GSM 06.10 RPE-LTP (160-samp frames)',
    portability: 'verified',
    params: [
      p(0, 'RATE', 55, 30, 100, 'kHz', 'stepped', 'Codec sample rate (14.7 kHz down to 5.5 kHz; GSM expects 8).', (v) => `${(44.1 / (3 + Math.floor((v * 5) / 100))).toFixed(1)} kHz`),
      p(1, 'LEVEL', 60, 30, 90, 'dB', 'linear', 'Pre-codec drive (-24 to +12 dB, compensated after).', (v) => `${Math.round(((v - 66) * 36) / 100)} dB`),
      p(2, 'TONE', 60, 20, 100, '%', 'linear', 'Anti-alias & reconstruction SVF cutoff.', fmtPct),
      p(3, 'STUTTER', 20, 0, 60, '%', 'probabilistic', 'Chance of repeating previous 33-byte GSM frame.', fmtPct),
    ],
    presets: [
      { name: 'HOME', params: [55, 60, 60, 20], mix: 0.9 },
      { name: '90s Cell', params: [50, 68, 55, 10], mix: 1.0 },
      { name: 'Bad Signal', params: [85, 82, 48, 55], mix: 0.95 },
    ],
  },
  {
    id: 43,
    slug: 'gendy',
    symbol: 'GY',
    name: 'GENDY',
    origin: 'molecular',
    category: 'glitch',
    tagline: 'Iannis Xenakis dynamic stochastic polygon waveform redrawer',
    description:
      'Tracks each input period via zero crossings and redraws the waveform as a linear polygon of 4–16 corners whose amplitudes and segment durations execute constrained random walks pulled back by ANCHOR.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_gendy',
    cStruct: 'nx_gendy_t',
    stateBytes: 248,
    internalRateHz: 44100,
    storageFormat: '16-breakpoint stochastic polygon',
    portability: 'verified',
    params: [
      p(0, 'CORNERS', 50, 0, 100, 'pt', 'stepped', 'Polygon breakpoints per tracked period (4–16).', (v) => `${4 + Math.floor((v * 12) / 100)} pts`),
      p(1, 'AMP WALK', 45, 10, 85, '%', 'linear', 'Stochastic amplitude walk step size.', fmtPct),
      p(2, 'DUR WALK', 40, 0, 85, '%', 'linear', 'Stochastic segment-duration walk step size.', fmtPct),
      p(3, 'ANCHOR', 40, 0, 80, '%', 'linear', 'Pull-back force anchoring walks to the input waveform.', fmtPct),
    ],
    presets: [
      { name: 'HOME', params: [50, 45, 40, 40], mix: 0.85 },
      { name: 'Xenakis Grit', params: [25, 78, 72, 22], mix: 0.9 },
      { name: 'Gentle Drift', params: [75, 28, 25, 65], mix: 0.8 },
    ],
  },
  {
    id: 44,
    slug: 'invert',
    symbol: 'IN',
    name: 'INVERT',
    origin: 'molecular',
    category: 'spectral',
    tagline: 'Analog speech-scrambler spectral mirror (f → F − f + shift)',
    description:
      'Band-limits the signal below mirror frequency F (400 Hz–8 kHz, 4-pole SVF), modulates by cosine at F + SHIFT, and low-passes again — flipping lows into highs and highs into lows.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_invert',
    cStruct: 'nx_invert_t',
    stateBytes: 120,
    internalRateHz: 44100,
    storageFormat: '5× SVF + cosine spectral mirror',
    portability: 'verified',
    params: [
      p(0, 'MIRROR', 45, 0, 100, 'Hz', 'log', 'Spectral folding axis F (400 Hz–7.9 kHz).', fmtLogHz(400, 4.3)),
      p(1, 'SHIFT', 50, 20, 80, 'Hz', 'linear', 'Carrier detune offset (-200 to +200 Hz).', (v) => `${(v - 50) * 4 >= 0 ? '+' : ''}${(v - 50) * 4} Hz`),
      p(2, 'RES', 35, 0, 70, 'Q', 'linear', '4-pole mirror filter resonance (Q 0.7–2.2).', (v) => `Q ${(0.7 + v * 0.015).toFixed(2)}`),
      p(3, 'BAND', 70, 30, 100, '%', 'linear', 'Passband width kept below F (50–100%).', (v) => `${Math.round(50 + v * 0.5)}%`),
    ],
    presets: [
      { name: 'HOME', params: [45, 50, 35, 70], mix: 0.85 },
      { name: 'Spy Scrambler', params: [52, 50, 25, 85], mix: 1.0 },
      { name: 'Metallic Flip', params: [72, 68, 58, 75], mix: 0.9 },
    ],
  },
  {
    id: 45,
    slug: 'squelch',
    symbol: 'SQ',
    name: 'SQUELCH',
    origin: 'molecular',
    category: 'glitch',
    tagline: 'Quadratic-Bézier undersampler with half-rate resonant acid squelch',
    description:
      'Samples audio at 200 Hz–12 kHz (modulated upward by input envelope FOLLOW), rebuilds between takes with quadratic Bézier curves distorted by MELTDOWN, and rings a resonant band-pass at half-rate.',
    sourceFile: 'core/atoms.c',
    cFunction: 'nx_squelch',
    cStruct: 'nx_squelch_t',
    stateBytes: 88,
    internalRateHz: 44100,
    storageFormat: 'Quadratic Bézier S&H + resonant SVF',
    portability: 'verified',
    params: [
      p(0, 'RATE', 45, 15, 85, 'Hz', 'log', 'Base sampling rate (200 Hz–12 kHz).', fmtLogHz(200, 5.9)),
      p(1, 'MELTDOWN', 40, 0, 100, '%', 'linear', 'Raw audio bleeding into Bézier control point.', fmtPct),
      p(2, 'SQUELCH', 45, 0, 90, 'Q', 'linear', 'Resonant band-pass emphasis at half the sample rate (Q 0.7–8).', (v) => `Q ${(0.7 + v * 0.073).toFixed(1)}`),
      p(3, 'FOLLOW', 50, 0, 100, '%', 'linear', 'Envelope modulation pushing sample rate upward.', fmtPct),
    ],
    presets: [
      { name: 'HOME', params: [45, 40, 45, 50], mix: 0.85 },
      { name: 'Acid Alias', params: [32, 65, 78, 72], mix: 0.9 },
      { name: 'Lo-Fi Chirp', params: [18, 30, 62, 45], mix: 0.85 },
    ],
  },
];

export function getEffectMeta(id: EffectId): EffectMeta {
  return EFFECTS_CATALOG[id] ?? EFFECTS_CATALOG[0];
}
