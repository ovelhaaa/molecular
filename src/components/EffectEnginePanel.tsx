/* SPDX-License-Identifier: GPL-3.0-only
 * Molecular FX Lab — Center Panel: 46-Atom Effect Engine Controls
 */

import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Music,
  Power,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import {
  EFFECT_CATEGORIES,
  EFFECTS_CATALOG,
  type EffectCategory,
  type EffectId,
  type EffectOrigin,
  type EffectPreset,
  MIDI_ROOT_NOTES,
  getEffectMeta,
} from '../effects/catalog';
import { RotaryKnob } from './RotaryKnob';

interface EffectEnginePanelProps {
  effectId: EffectId;
  params: [number, number, number, number];
  rootNote: number;
  mix: number;
  bypass: boolean;
  outputGainDb: number;
  guardEnabled: boolean;
  stereoDecorrelate: boolean;
  onSelectEffect: (id: EffectId) => void;
  onParamChange: (index: 0 | 1 | 2 | 3, value: number) => void;
  onRootNoteChange: (midiNote: number) => void;
  onApplyPreset: (preset: EffectPreset) => void;
  onMixChange: (mix: number) => void;
  onToggleBypass: () => void;
  onOutputGainChange: (db: number) => void;
  onToggleGuard: () => void;
  onToggleDecorrelate: () => void;
  onResetState: () => void;
}

const ORIGIN_LABEL: Record<EffectOrigin, string> = {
  norilsk: 'Norilsk',
  tonitor: 'Tonitor',
  molecular: 'Molecular',
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function formatMidiNote(midi: number): string {
  const note = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  const hz = 440 * Math.pow(2, (midi - 69) / 12);
  return `${note}${octave} · ${hz.toFixed(1)} Hz`;
}

export const EffectEnginePanel: React.FC<EffectEnginePanelProps> = ({
  effectId,
  params,
  rootNote,
  mix,
  bypass,
  outputGainDb,
  guardEnabled,
  stereoDecorrelate,
  onSelectEffect,
  onParamChange,
  onRootNoteChange,
  onApplyPreset,
  onMixChange,
  onToggleBypass,
  onOutputGainChange,
  onToggleGuard,
  onToggleDecorrelate,
  onResetState,
}) => {
  const meta = getEffectMeta(effectId);
  const [category, setCategory] = useState<EffectCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [matrixOpen, setMatrixOpen] = useState(true);

  const filteredEffects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EFFECTS_CATALOG.filter((fx) => {
      if (category !== 'all' && fx.category !== category) return false;
      if (!q) return true;
      return (
        fx.name.toLowerCase().includes(q) ||
        fx.symbol.toLowerCase().includes(q) ||
        fx.tagline.toLowerCase().includes(q) ||
        fx.origin.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  const handlePrevEffect = () => {
    const prev = (effectId - 1 + EFFECTS_CATALOG.length) % EFFECTS_CATALOG.length;
    onSelectEffect(prev);
  };

  const handleNextEffect = () => {
    const next = (effectId + 1) % EFFECTS_CATALOG.length;
    onSelectEffect(next);
  };

  const hasPresetRootOption = MIDI_ROOT_NOTES.some((n) => n.midi === rootNote);

  return (
    <section
      aria-label="Effect Engine"
      className="bg-[#232528] text-[#F2EFE9] border border-[#34373D] rounded-lg p-5 flex flex-col gap-4"
    >
      {/* Top Bar: Active Atom Switcher + Matrix Toggle + Reset + Bypass */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-[#34373D]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevEffect}
            title="Previous effect ([)"
            aria-label="Previous effect"
            className="p-1.5 rounded bg-[#181A1D] hover:bg-[#2B2E34] text-[#C8CBD2] hover:text-white border border-[#32363C] transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setMatrixOpen((v) => !v)}
            aria-expanded={matrixOpen}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#181A1D] hover:bg-[#22252A] border border-[#32363C] transition-colors cursor-pointer"
          >
            <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded-xs bg-[#EA580C] text-white">
              {meta.symbol}
            </span>
            <span className="text-xs font-semibold tracking-wide text-[#F5F2EC] whitespace-nowrap">
              {meta.name}
            </span>
            <span className="font-mono text-[10px] text-[#7E848E] tabular-nums">
              {String(effectId + 1).padStart(2, '0')}/{EFFECTS_CATALOG.length}
            </span>
            {matrixOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-[#8E939C]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[#8E939C]" />
            )}
          </button>

          <button
            type="button"
            onClick={handleNextEffect}
            title="Next effect (])"
            aria-label="Next effect"
            className="p-1.5 rounded bg-[#181A1D] hover:bg-[#2B2E34] text-[#C8CBD2] hover:text-white border border-[#32363C] transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onResetState}
            title="Clear internal delay / ring buffers and reset DSP filter states"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded bg-[#2B2E34] hover:bg-[#353940] text-[#D8D5CE] border border-[#3E424A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <button
            type="button"
            onClick={onToggleBypass}
            aria-pressed={bypass}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              bypass
                ? 'bg-[#F5F2EC] text-[#1D1F22] border-[#F5F2EC]'
                : 'bg-[#1A1C1F] text-[#FB923C] border-[#EA580C] hover:bg-[#EA580C]/15'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {bypass ? 'Bypassed' : 'Active'}
          </button>
        </div>
      </div>

      {/* Collapsible 46-Atom Periodic Selector Matrix */}
      {matrixOpen && (
        <div className="bg-[#181A1D] border border-[#30343B] rounded-md p-2.5 flex flex-col gap-2">
          {/* Category Filter + Search */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {EFFECT_CATEGORIES.map((cat) => {
                const active = cat.id === category;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded-xs transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-[#EA580C] text-white'
                        : 'bg-[#23262B] text-[#9A9EA6] hover:text-[#F2EFE9] hover:bg-[#2C3037]'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            <div className="relative flex-1 min-w-[130px] max-w-[180px]">
              <Search className="w-3 h-3 text-[#7E848E] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter atoms..."
                aria-label="Filter effects"
                className="w-full bg-[#121417] border border-[#2D3138] focus:border-[#EA580C] focus:outline-none rounded-xs pl-6 pr-6 py-0.5 text-[11px] font-mono text-[#F2EFE9] placeholder:text-[#666B74]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#7E848E] hover:text-[#F2EFE9] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Atom Tiles Grid */}
          {filteredEffects.length === 0 ? (
            <div className="py-4 text-center font-mono text-[11px] text-[#7E848E]">
              No atoms match &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 max-h-[152px] overflow-y-auto pr-0.5">
              {filteredEffects.map((fx) => {
                const active = fx.id === effectId;
                return (
                  <button
                    key={fx.id}
                    type="button"
                    onClick={() => onSelectEffect(fx.id)}
                    title={`${fx.name} (${ORIGIN_LABEL[fx.origin]}) — ${fx.tagline}`}
                    className={`px-1.5 py-1.5 rounded-xs border text-left transition-colors cursor-pointer flex flex-col gap-0.5 ${
                      active
                        ? 'bg-[#EA580C] border-[#F97316] text-white'
                        : 'bg-[#1F2227] border-[#2C3037] text-[#C8CBD2] hover:border-[#4A505A] hover:bg-[#262A30]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`font-mono text-[11px] font-bold leading-none ${
                          active ? 'text-white' : 'text-[#F5F2EC]'
                        }`}
                      >
                        {fx.symbol}
                      </span>
                      <span
                        className={`font-mono text-[8px] uppercase leading-none ${
                          active ? 'text-white/75' : 'text-[#6A707A]'
                        }`}
                      >
                        {fx.origin === 'norilsk' ? 'N' : fx.origin === 'tonitor' ? 'T' : 'M'}
                      </span>
                    </div>
                    <span
                      className={`text-[9px] font-medium truncate leading-tight ${
                        active ? 'text-white/95' : 'text-[#8E939C]'
                      }`}
                    >
                      {fx.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Algorithm Identity, Presets & Concise Technical Description */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-[#F5F2EC]">{meta.name}</h2>
            <span className="font-mono text-xs text-[#9A9EA6]">
              {meta.cFunction}() · {meta.stateBytes.toLocaleString()} B{meta.trueStereo ? ' stereo' : '/ch'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {meta.presets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => onApplyPreset(preset)}
                className="px-2 py-0.5 text-[11px] font-mono text-[#B0B4BC] hover:text-[#F5F2EC] bg-[#1A1C1F] hover:bg-[#2C2F36] border border-[#343840] rounded-sm transition-colors whitespace-nowrap cursor-pointer"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-[#A9ADB5] leading-relaxed">{meta.description}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-[#7E848E]">
          <span>{ORIGIN_LABEL[meta.origin]}</span>
          <span aria-hidden="true">·</span>
          <span>{meta.sourceFile}</span>
          <span aria-hidden="true">·</span>
          <span>{meta.storageFormat}</span>
          {meta.trueStereo && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[#FB923C]">True Stereo</span>
            </>
          )}
        </div>
      </div>

      {/* Conditional Root Pitch Control (rack_root) for Pitched Resonators */}
      {meta.usesRootNote && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#1A1C1F] border border-[#32363C] rounded-md px-3 py-2">
          <div className="flex items-center gap-2">
            <Music className="w-3.5 h-3.5 text-[#FB923C]" />
            <span className="text-xs font-medium text-[#D8D5CE]">Root Pitch</span>
            <span className="font-mono text-[11px] text-[#8E939C]">(rack_root)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onRootNoteChange(Math.max(24, rootNote - 1))}
              className="px-2 py-0.5 font-mono text-xs bg-[#26292E] hover:bg-[#32363D] border border-[#3C4048] rounded-xs text-[#D8D5CE] cursor-pointer"
              title="Lower root note by 1 semitone"
            >
              -1
            </button>
            <select
              aria-label="Root Note"
              value={rootNote}
              onChange={(e) => onRootNoteChange(parseInt(e.target.value, 10))}
              className="bg-[#121417] border border-[#383C44] rounded-xs px-2 py-0.5 font-mono text-xs text-[#F2EFE9] cursor-pointer focus:border-[#EA580C] focus:outline-none"
            >
              {!hasPresetRootOption && (
                <option value={rootNote}>MIDI {rootNote} ({formatMidiNote(rootNote)})</option>
              )}
              {MIDI_ROOT_NOTES.map((n) => (
                <option key={n.midi} value={n.midi}>
                  {n.label} (MIDI {n.midi})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onRootNoteChange(Math.min(84, rootNote + 1))}
              className="px-2 py-0.5 font-mono text-xs bg-[#26292E] hover:bg-[#32363D] border border-[#3C4048] rounded-xs text-[#D8D5CE] cursor-pointer"
              title="Raise root note by 1 semitone"
            >
              +1
            </button>
            <span className="font-mono text-[11px] text-[#FB923C] tabular-nums ml-1 hidden sm:inline">
              {formatMidiNote(rootNote)}
            </span>
          </div>
        </div>
      )}

      {/* Four Original Parameters Grid */}
      <div className="grid grid-cols-2 gap-3.5">
        {meta.params.map((p) => (
          <RotaryKnob
            key={`${meta.id}-${p.index}`}
            param={p}
            value={params[p.index]}
            onChange={(nextVal) => onParamChange(p.index, nextVal)}
          />
        ))}
      </div>

      {/* Dry/Wet Mix & Output Gain */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#34373D]">
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label htmlFor="dry-wet-slider" className="text-xs font-medium text-[#D8D5CE]">
              Dry / Wet Mix
            </label>
            <span className="font-mono text-xs text-[#F2EFE9] tabular-nums">
              {Math.round(mix * 100)}% Wet
            </span>
          </div>
          <input
            id="dry-wet-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(mix * 100)}
            onChange={(e) => onMixChange(parseInt(e.target.value, 10) / 100)}
            onDoubleClick={() => onMixChange(0.5)}
            className="studio-fader w-full"
          />
          <div className="flex justify-between font-mono text-[10px] text-[#7E848E] mt-1 tabular-nums">
            <span>Dry</span>
            <span>50%</span>
            <span>Wet</span>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label htmlFor="output-gain-slider" className="text-xs font-medium text-[#D8D5CE]">
              Output Gain
            </label>
            <span className="font-mono text-xs text-[#F2EFE9] tabular-nums">
              {outputGainDb >= 0 ? `+${outputGainDb.toFixed(1)}` : outputGainDb.toFixed(1)} dB
            </span>
          </div>
          <input
            id="output-gain-slider"
            type="range"
            min={-24}
            max={12}
            step={0.5}
            value={outputGainDb}
            onChange={(e) => onOutputGainChange(parseFloat(e.target.value))}
            onDoubleClick={() => onOutputGainChange(0)}
            className="studio-fader w-full"
          />
          <div className="flex justify-between font-mono text-[10px] text-[#7E848E] mt-1 tabular-nums">
            <span>-24 dB</span>
            <span>0 dB</span>
            <span>+12 dB</span>
          </div>
        </div>
      </div>

      {/* Engine Fidelity Options */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#32363C] text-xs">
        <label className="flex items-center gap-2 text-[#B8BCC4] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={guardEnabled}
            onChange={onToggleGuard}
            className="accent-[#EA580C] w-3.5 h-3.5 rounded-sm cursor-pointer"
          />
          <span>Peak Guard</span>
          <span className="font-mono text-[10px] text-[#7E848E]">(fx_guard)</span>
        </label>

        <label
          className={`flex items-center gap-2 select-none ${
            meta.trueStereo ? 'text-[#6A707A] cursor-not-allowed' : 'text-[#B8BCC4] cursor-pointer'
          }`}
          title={
            meta.trueStereo
              ? 'This Tonitor engine runs in native true-stereo mode'
              : 'Offsets Right channel PRNG seed (fx_place = 24576) for stereo-decorrelated stochastic atoms'
          }
        >
          <input
            type="checkbox"
            checked={stereoDecorrelate}
            disabled={Boolean(meta.trueStereo)}
            onChange={onToggleDecorrelate}
            className="accent-[#EA580C] w-3.5 h-3.5 rounded-sm cursor-pointer disabled:opacity-40"
          />
          <span>Stereo Seed Offset</span>
          <span className="font-mono text-[10px] text-[#7E848E]">(fx_place)</span>
        </label>
      </div>
    </section>
  );
};
