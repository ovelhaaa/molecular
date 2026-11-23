/* SPDX-License-Identifier: GPL-3.0-only
 * Molecular FX Lab — Right Panel: Real-Time Oscilloscope, Spectrum, Stereo Meters & 46-Atom DSP Telemetry
 */

import React, { useEffect, useRef } from 'react';
import { gainToDb, type TelemetryFrame } from '../audio/AudioEngine';
import { type EffectId, getEffectMeta } from '../effects/catalog';

interface SignalVisualizerProps {
  effectId: EffectId;
  getAnalysers: () => { pre: AnalyserNode | null; post: AnalyserNode | null };
  telemetryRef: React.RefObject<TelemetryFrame | null>;
  telemetry: TelemetryFrame | null;
  bypass: boolean;
}

function dbToPercent(db: number): number {
  const minDb = -60;
  const maxDb = 0;
  return Math.max(0, Math.min(100, ((db - minDb) / (maxDb - minDb)) * 100));
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function MeterBar({ label, peak, rms }: { label: string; peak: number; rms: number }) {
  const peakDb = gainToDb(peak);
  const rmsDb = gainToDb(rms);
  const peakPct = dbToPercent(peakDb);
  const rmsPct = dbToPercent(rmsDb);
  const isClip = peak >= 0.99;

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] text-[#9A9EA6] w-5 shrink-0">{label}</span>
      <div className="relative flex-1 h-2.5 bg-[#15171A] border border-[#30343B] rounded-xs overflow-hidden">
        {/* RMS fill */}
        <div
          className="absolute inset-y-0 left-0 bg-[#EA580C]/80 transition-[width] duration-75"
          style={{ width: `${rmsPct}%` }}
        />
        {/* Peak marker */}
        <div
          className={`absolute inset-y-0 w-[2px] ${isClip ? 'bg-[#EF4444]' : 'bg-[#F5F2EC]'}`}
          style={{ left: `calc(${peakPct}% - 1px)` }}
        />
      </div>
      <span
        className={`font-mono text-[11px] w-14 text-right tabular-nums shrink-0 ${
          isClip ? 'text-[#F87171] font-semibold' : 'text-[#C8CBD2]'
        }`}
      >
        {peakDb <= -60 ? '-∞ dB' : `${peakDb.toFixed(1)} dB`}
      </span>
    </div>
  );
}

function EffectTelemetryReadout({
  effectId,
  telemetry,
}: {
  effectId: EffectId;
  telemetry: TelemetryFrame | null;
}) {
  const meta = getEffectMeta(effectId);
  const s = telemetry?.dspState ?? [effectId, 32768, 0, 0, 0, 0, 0, 48];
  const guardGainDb = gainToDb(Math.max(1e-4, s[1] / 32768));
  const guardEnvPct = clampPct(Math.round((s[2] / 32768) * 100));

  // 0: TAPE
  if (effectId === 0) {
    const gatePct = clampPct(Math.round((s[3] / 32768) * 100));
    const delayMs = Math.round((s[5] / 22050) * 1000);
    const headPct = clampPct((s[7] / 19900) * 100);
    const dropping = s[4] > 0;
    const hissEnvPct = clampPct(Math.round((s[6] / 16384) * 100));

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Tape Transport State</span>
          <span className={`font-mono ${dropping ? 'text-[#FB923C]' : 'text-[#8E939C]'}`}>
            {dropping ? '▲ DROPOUT ACTIVE' : `HEAD ${delayMs} ms`}
          </span>
        </div>

        <div>
          <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
            <span>μ-law Ring Position (19,900 @ 22.05 kHz)</span>
            <span>{Math.round(headPct)}%</span>
          </div>
          <div className="relative h-2 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
            <div
              className="absolute inset-y-0 bg-[#F97316]"
              style={{ left: `${headPct}%`, width: '6px', transform: 'translateX(-3px)' }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Oxide Gate</div>
            <div className="text-[#F2EFE9] tabular-nums">{gatePct}%</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Signal Env</div>
            <div className="text-[#F2EFE9] tabular-nums">{hissEnvPct}%</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // 1: REVERSE
  if (effectId === 1) {
    const phA = (s[3] & 0xffff) / 65535;
    const phB = (s[4] & 0xffff) / 65535;
    const triA = phA < 0.5 ? phA * 2 : (1 - phA) * 2;
    const triB = phB < 0.5 ? phB * 2 : (1 - phB) * 2;

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Dual Reverse Read Heads</span>
          <span className="font-mono text-[#8E939C]">180° Triangle Overlap</span>
        </div>

        <div className="space-y-2">
          <div>
            <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
              <span>Head A Window Gain</span>
              <span>{Math.round(triA * 100)}%</span>
            </div>
            <div className="h-2 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
              <div className="h-full bg-[#F97316]" style={{ width: `${triA * 100}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
              <span>Head B Window Gain</span>
              <span>{Math.round(triB * 100)}%</span>
            </div>
            <div className="h-2 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
              <div className="h-full bg-[#D8D5CE]/75" style={{ width: `${triB * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Write Pointer</div>
            <div className="text-[#F2EFE9] tabular-nums">{s[5]} / 19845</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // 2: GLITCH
  if (effectId === 2) {
    const mask = s[3] >>> 0;
    const backMs = Math.round((s[4] / 22050) * 1000);
    const stuttering = s[5] > 0;
    const loopMs = Math.round((s[6] / 22050) * 1000);
    const bits = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4];

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Address Bit-Bend & Stutter</span>
          <span className={`font-mono ${stuttering ? 'text-[#FB923C]' : 'text-[#8E939C]'}`}>
            {stuttering ? `● STUTTER ${loopMs} ms` : `OFFSET ${backMs} ms`}
          </span>
        </div>

        <div>
          <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
            <span>XOR Address Mask (bits 13..4)</span>
            <span>0x{mask.toString(16).toUpperCase().padStart(4, '0')}</span>
          </div>
          <div className="grid grid-cols-10 gap-1">
            {bits.map((bit) => {
              const on = ((mask >> bit) & 1) !== 0;
              return (
                <div
                  key={bit}
                  className={`h-6 rounded-xs border flex items-center justify-center font-mono text-[10px] ${
                    on
                      ? 'bg-[#EA580C] border-[#F97316] text-white font-semibold'
                      : 'bg-[#121417] border-[#2D3138] text-[#6B707A]'
                  }`}
                >
                  {bit}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Stutter Left</div>
            <div className="text-[#F2EFE9] tabular-nums">{s[5]} samp</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // 11: CLOUD (Granular Cloud)
  if (effectId === 11) {
    const activeGrains = Math.max(0, Math.min(6, s[3]));
    const frozen = s[4] !== 0;
    const fillPct = clampPct(s[5]);

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Granular Cloud Engine</span>
          <span className={`font-mono ${frozen ? 'text-[#FB923C]' : 'text-[#8E939C]'}`}>
            {frozen ? '❄ BUFFER FROZEN' : `${activeGrains}/6 GRAINS`}
          </span>
        </div>

        <div>
          <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
            <span>Active Grain Voices</span>
            <span>{activeGrains} / 6</span>
          </div>
          <div className="grid grid-cols-6 gap-1">
            {[0, 1, 2, 3, 4, 5].map((idx) => (
              <div
                key={idx}
                className={`h-5 rounded-xs border flex items-center justify-center font-mono text-[10px] ${
                  idx < activeGrains
                    ? 'bg-[#EA580C] border-[#F97316] text-white font-semibold'
                    : 'bg-[#121417] border-[#2D3138] text-[#6B707A]'
                }`}
              >
                G{idx + 1}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Cloud Fill</div>
            <div className="text-[#F2EFE9] tabular-nums">{fillPct}%</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // 14: STARVE
  if (effectId === 14) {
    const open = s[3] !== 0;
    const envPct = clampPct(Math.round((s[4] / 32768) * 100));

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Rail Starvation Gate</span>
          <span className={`font-mono ${open ? 'text-[#22C55E]' : 'text-[#FB923C]'}`}>
            {open ? '● RAIL OPEN' : '○ STARVED'}
          </span>
        </div>

        <div>
          <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
            <span>Input Envelope</span>
            <span>{envPct}%</span>
          </div>
          <div className="h-2 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
            <div className="h-full bg-[#F97316]" style={{ width: `${envPct}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Gate State</div>
            <div className="text-[#F2EFE9]">{open ? 'Conducting' : 'Choked'}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // 22: WAVESET
  if (effectId === 22) {
    const modes = ['Repeat', 'Reverse', 'Stretch', 'Omit'];
    const modeName = modes[s[3]] ?? 'Repeat';
    const dir = s[5] < 0 ? 'REV' : 'FWD';
    const omitted = s[6] !== 0;

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Zero-Crossing Waveset</span>
          <span className={`font-mono ${omitted ? 'text-[#FB923C]' : 'text-[#8E939C]'}`}>
            {omitted ? '○ OMITTED' : `${modeName.toUpperCase()} · ${dir}`}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Active Span</div>
            <div className="text-[#F2EFE9] tabular-nums">{s[4]} samp</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Read Dir</div>
            <div className="text-[#F2EFE9]">{dir}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // 24: CHAOS (Duffing Oscillator)
  if (effectId === 24) {
    const posNorm = clampPct(50 + (s[3] / 120000) * 50);
    const gatePct = clampPct(Math.round((s[6] / 32768) * 100));

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Duffing Double-Well State</span>
          <span className="font-mono text-[#8E939C]">Gate {gatePct}%</span>
        </div>

        <div>
          <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
            <span>Well Displacement (x)</span>
            <span className="tabular-nums">{s[3]}</span>
          </div>
          <div className="relative h-2 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
            <div className="absolute inset-y-0 left-1/2 w-[1px] bg-[#3A3E47]" />
            <div
              className="absolute inset-y-0 bg-[#F97316]"
              style={{ left: `${posNorm}%`, width: '6px', transform: 'translateX(-3px)' }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Velocity</div>
            <div className="text-[#F2EFE9] tabular-nums">{s[4]}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Drive Env</div>
            <div className="text-[#F2EFE9] tabular-nums">{Math.round((s[5] / 32768) * 100)}%</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // 25: DELAY (Tonitor 2s μ-law)
  if (effectId === 25) {
    const delayMs = Math.round((s[3] / 22050) * 1000);
    const ptrPct = clampPct((s[4] / 44100) * 100);
    const fbPct = clampPct(Math.round((s[6] / 32768) * 100));

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Tonitor 2s μ-Law Line</span>
          <span className="font-mono text-[#FB923C] tabular-nums">{delayMs} ms</span>
        </div>

        <div>
          <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
            <span>44,100-Sample Ring @ 22.05 kHz</span>
            <span>{Math.round(ptrPct)}%</span>
          </div>
          <div className="relative h-2 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
            <div
              className="absolute inset-y-0 bg-[#F97316]"
              style={{ left: `${ptrPct}%`, width: '6px', transform: 'translateX(-3px)' }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Feedback Q15</div>
            <div className="text-[#F2EFE9] tabular-nums">{fbPct}%</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // 26: REVERB (Dattorro True-Stereo Plate)
  if (effectId === 26) {
    const scaleX = (s[3] / 4096).toFixed(2);
    const decayPct = clampPct(Math.round((s[4] / 32768) * 100));
    const lfoA = clampPct(((s[5] & 0xffff) / 65535) * 100);
    const lfoB = clampPct(((s[6] & 0xffff) / 65535) * 100);

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Dattorro 14-Tap Plate Tank</span>
          <span className="font-mono text-[#FB923C] tabular-nums">Scale {scaleX}×</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
              <span>Tank LFO A</span>
              <span>{Math.round(lfoA)}%</span>
            </div>
            <div className="h-1.5 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
              <div className="h-full bg-[#F97316]" style={{ width: `${lfoA}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
              <span>Tank LFO B</span>
              <span>{Math.round(lfoB)}%</span>
            </div>
            <div className="h-1.5 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
              <div className="h-full bg-[#D8D5CE]/75" style={{ width: `${lfoB}%` }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Tank Decay</div>
            <div className="text-[#F2EFE9] tabular-nums">{decayPct}%</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // 27: SPIRAL
  if (effectId === 27) {
    const phA = ((s[3] & 0xffff) / 65535) * 100;
    const phB = ((s[4] & 0xffff) / 65535) * 100;
    const delayMs = Math.round((s[5] / 22050) * 1000);

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Spiral Pitch-Feedback Loop</span>
          <span className="font-mono text-[#FB923C] tabular-nums">{delayMs} ms</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
              <span>Shift Head A</span>
              <span>{Math.round(phA)}%</span>
            </div>
            <div className="h-1.5 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
              <div className="h-full bg-[#F97316]" style={{ width: `${phA}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
              <span>Shift Head B</span>
              <span>{Math.round(phB)}%</span>
            </div>
            <div className="h-1.5 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
              <div className="h-full bg-[#D8D5CE]/75" style={{ width: `${phB}%` }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Grain Window</div>
            <div className="text-[#F2EFE9] tabular-nums">{s[6]} samp</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // 30: LPG (Vactrol Low-Pass Gate)
  if (effectId === 30) {
    const cvPct = clampPct(Math.round((s[3] / 32768) * 100));
    const decayMs = Math.round((s[6] / 44100) * 1000);

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Vactrol Cell Conductance</span>
          <span className="font-mono text-[#FB923C] tabular-nums">CV {cvPct}%</span>
        </div>

        <div>
          <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
            <span>Photoresistor Gate CV</span>
            <span>{cvPct}%</span>
          </div>
          <div className="h-2 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
            <div className="h-full bg-[#F97316]" style={{ width: `${cvPct}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Drawn Decay</div>
            <div className="text-[#F2EFE9] tabular-nums">{decayMs} ms</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // 32: STICK (Stick-Slip Friction)
  if (effectId === 32) {
    const stuck = s[3] !== 0;
    const posNorm = clampPct(50 + (s[4] / 32768) * 50);

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Stick-Slip Mass Oscillator</span>
          <span className={`font-mono ${stuck ? 'text-[#8E939C]' : 'text-[#FB923C]'}`}>
            {stuck ? '■ STUCK' : '▶ SLIPPING'}
          </span>
        </div>

        <div>
          <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
            <span>Mass Displacement</span>
            <span className="tabular-nums">{s[4]}</span>
          </div>
          <div className="relative h-2 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
            <div className="absolute inset-y-0 left-1/2 w-[1px] bg-[#3A3E47]" />
            <div
              className="absolute inset-y-0 bg-[#F97316]"
              style={{ left: `${posNorm}%`, width: '6px', transform: 'translateX(-3px)' }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Velocity</div>
            <div className="text-[#F2EFE9] tabular-nums">{s[5]}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // 37: SUBHARM
  if (effectId === 37) {
    const divA = Math.max(1, s[3]);
    const divB = Math.max(1, s[4]);
    const ffA = s[5] !== 0;
    const ffB = s[6] !== 0;

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Trautonium Subharmonic Dividers</span>
          <span className="font-mono text-[#FB923C] tabular-nums">÷{divA} / ÷{divB}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div
            className={`px-2.5 py-1.5 rounded-xs border font-mono text-[11px] flex items-center justify-between ${
              ffA ? 'bg-[#EA580C]/20 border-[#EA580C] text-[#F5F2EC]' : 'bg-[#121417] border-[#2D3138] text-[#8E939C]'
            }`}
          >
            <span>Div A (÷{divA})</span>
            <span>{ffA ? 'HIGH' : 'LOW'}</span>
          </div>
          <div
            className={`px-2.5 py-1.5 rounded-xs border font-mono text-[11px] flex items-center justify-between ${
              ffB ? 'bg-[#EA580C]/20 border-[#EA580C] text-[#F5F2EC]' : 'bg-[#121417] border-[#2D3138] text-[#8E939C]'
            }`}
          >
            <span>Div B (÷{divB})</span>
            <span>{ffB ? 'HIGH' : 'LOW'}</span>
          </div>
        </div>

        <div className="flex justify-between font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <span className="text-[#7E848E]">Guard Gain</span>
          <span className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</span>
        </div>
      </div>
    );
  }

  // 41: DOPPLER
  if (effectId === 41) {
    const deg = Math.round(((s[3] & 0xffff) / 65536) * 360);
    const delayMs = ((s[4] / 44100) * 1000).toFixed(1);
    const distGainPct = clampPct(Math.round((s[5] / 32768) * 100));

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">Acoustic Orbit Telemetry</span>
          <span className="font-mono text-[#FB923C] tabular-nums">{deg}° · {delayMs} ms</span>
        </div>

        <div>
          <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
            <span>Inverse-Distance Gain (1/d)</span>
            <span>{distGainPct}%</span>
          </div>
          <div className="h-2 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
            <div className="h-full bg-[#F97316]" style={{ width: `${distGainPct}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Orbit Phase</div>
            <div className="text-[#F2EFE9] tabular-nums">{deg}°</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // 42: GSM (Real GSM 06.10 Codec)
  if (effectId === 42) {
    const framePos = Math.max(0, Math.min(160, s[3]));
    const framePct = clampPct((framePos / 160) * 100);
    const fac = Math.max(1, s[4]);
    const effRateHz = Math.round(44100 / fac);

    return (
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#D8D5CE]">GSM 06.10 RPE-LTP Codec</span>
          <span className="font-mono text-[#FB923C] tabular-nums">÷{fac} ({(effRateHz / 1000).toFixed(1)} kHz)</span>
        </div>

        <div>
          <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
            <span>160-Sample Codec Frame</span>
            <span>{framePos} / 160</span>
          </div>
          <div className="h-2 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
            <div className="h-full bg-[#F97316]" style={{ width: `${framePct}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
          <div>
            <div className="text-[10px] text-[#7E848E]">Frame Peak</div>
            <div className="text-[#F2EFE9] tabular-nums">{s[5]}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
            <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
          </div>
        </div>
      </div>
    );
  }

  // Default universal Q15 DSP Core State readout for all remaining 31 atoms
  return (
    <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-[#D8D5CE]">
          [{meta.symbol}] {meta.name} · Q15 Core
        </span>
        <span className="font-mono text-[#8E939C] tabular-nums">
          {(meta.internalRateHz / 1000).toFixed(2)} kHz
        </span>
      </div>

      <div>
        <div className="flex justify-between font-mono text-[10px] text-[#8E939C] mb-1">
          <span>Peak Guard Envelope (fx_guard)</span>
          <span>{guardEnvPct}%</span>
        </div>
        <div className="h-2 bg-[#121417] border border-[#2D3138] rounded-xs overflow-hidden">
          <div className="h-full bg-[#F97316]" style={{ width: `${guardEnvPct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 font-mono text-[11px] pt-1 border-t border-[#2A2D33]">
        <div>
          <div className="text-[10px] text-[#7E848E]">Guard Gain</div>
          <div className="text-[#F2EFE9] tabular-nums">{guardGainDb.toFixed(1)} dB</div>
        </div>
        <div>
          <div className="text-[10px] text-[#7E848E]">State RAM</div>
          <div className="text-[#F2EFE9] tabular-nums">{meta.stateBytes.toLocaleString()} B</div>
        </div>
        <div>
          <div className="text-[10px] text-[#7E848E]">{meta.usesRootNote ? 'Root MIDI' : 'Block'}</div>
          <div className="text-[#F2EFE9] tabular-nums">
            {meta.usesRootNote ? `MIDI ${s[7]}` : 'CTL=32'}
          </div>
        </div>
      </div>
    </div>
  );
}

export const SignalVisualizer: React.FC<SignalVisualizerProps> = ({
  effectId,
  getAnalysers,
  telemetry,
  bypass,
}) => {
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const specCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let rafId = 0;
    const preTime = new Float32Array(1024);
    const postTime = new Float32Array(1024);
    const freqData = new Float32Array(1024);

    const draw = () => {
      const { pre, post } = getAnalysers();

      // 1. Oscilloscope Waveform Canvas
      const wc = waveCanvasRef.current;
      if (wc) {
        const dpr = window.devicePixelRatio || 1;
        const cssW = wc.clientWidth;
        const cssH = wc.clientHeight;
        if (wc.width !== Math.round(cssW * dpr) || wc.height !== Math.round(cssH * dpr)) {
          wc.width = Math.round(cssW * dpr);
          wc.height = Math.round(cssH * dpr);
        }
        const ctx = wc.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.fillStyle = '#141619';
          ctx.fillRect(0, 0, cssW, cssH);

          // Graticule
          ctx.strokeStyle = '#24272D';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, cssH / 2);
          ctx.lineTo(cssW, cssH / 2);
          ctx.moveTo(0, cssH * 0.25);
          ctx.lineTo(cssW, cssH * 0.25);
          ctx.moveTo(0, cssH * 0.75);
          ctx.lineTo(cssW, cssH * 0.75);
          ctx.stroke();

          if (pre) {
            pre.getFloatTimeDomainData(preTime);
            ctx.strokeStyle = 'rgba(162, 166, 174, 0.35)';
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            for (let i = 0; i < preTime.length; i++) {
              const x = (i / (preTime.length - 1)) * cssW;
              const y = cssH / 2 - preTime[i] * (cssH * 0.44);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }

          if (post) {
            post.getFloatTimeDomainData(postTime);
            ctx.strokeStyle = bypass ? '#D8D5CE' : '#F97316';
            ctx.lineWidth = 1.75;
            ctx.beginPath();
            for (let i = 0; i < postTime.length; i++) {
              const x = (i / (postTime.length - 1)) * cssW;
              const y = cssH / 2 - postTime[i] * (cssH * 0.44);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // 2. Logarithmic FFT Spectrum Canvas
      const sc = specCanvasRef.current;
      if (sc) {
        const dpr = window.devicePixelRatio || 1;
        const cssW = sc.clientWidth;
        const cssH = sc.clientHeight;
        if (sc.width !== Math.round(cssW * dpr) || sc.height !== Math.round(cssH * dpr)) {
          sc.width = Math.round(cssW * dpr);
          sc.height = Math.round(cssH * dpr);
        }
        const ctx = sc.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.fillStyle = '#141619';
          ctx.fillRect(0, 0, cssW, cssH);

          const minF = 30;
          const maxF = 20000;
          const logMin = Math.log10(minF);
          const logMax = Math.log10(maxF);

          ctx.strokeStyle = '#24272D';
          ctx.lineWidth = 1;
          for (const f of [100, 1000, 10000]) {
            const x = ((Math.log10(f) - logMin) / (logMax - logMin)) * cssW;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, cssH);
            ctx.stroke();
          }
          for (const ratio of [0.25, 0.5, 0.75]) {
            ctx.beginPath();
            ctx.moveTo(0, cssH * ratio);
            ctx.lineTo(cssW, cssH * ratio);
            ctx.stroke();
          }

          if (post) {
            post.getFloatFrequencyData(freqData);
            const nyquist = (post.context.sampleRate || 44100) / 2;
            const binCount = freqData.length;

            ctx.beginPath();
            ctx.moveTo(0, cssH);
            const steps = 160;
            for (let s = 0; s <= steps; s++) {
              const frac = s / steps;
              const freq = Math.pow(10, logMin + frac * (logMax - logMin));
              const bin = Math.min(binCount - 1, Math.max(1, Math.round((freq / nyquist) * binCount)));
              const db = Number.isFinite(freqData[bin]) ? freqData[bin] : -100;
              const norm = Math.max(0, Math.min(1, (db + 90) / 84));
              const x = frac * cssW;
              const y = cssH - norm * (cssH - 8);
              ctx.lineTo(x, y);
            }
            ctx.lineTo(cssW, cssH);
            ctx.closePath();
            ctx.fillStyle = bypass ? 'rgba(216, 213, 206, 0.14)' : 'rgba(249, 115, 22, 0.18)';
            ctx.fill();

            ctx.beginPath();
            for (let s = 0; s <= steps; s++) {
              const frac = s / steps;
              const freq = Math.pow(10, logMin + frac * (logMax - logMin));
              const bin = Math.min(binCount - 1, Math.max(1, Math.round((freq / nyquist) * binCount)));
              const db = Number.isFinite(freqData[bin]) ? freqData[bin] : -100;
              const norm = Math.max(0, Math.min(1, (db + 90) / 84));
              const x = frac * cssW;
              const y = cssH - norm * (cssH - 8);
              if (s === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = bypass ? '#D8D5CE' : '#F97316';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          ctx.fillStyle = '#757A84';
          ctx.font = '10px "IBM Plex Mono", monospace';
          ctx.fillText('100 Hz', ((Math.log10(100) - logMin) / (logMax - logMin)) * cssW + 4, cssH - 5);
          ctx.fillText('1 kHz', ((Math.log10(1000) - logMin) / (logMax - logMin)) * cssW + 4, cssH - 5);
          ctx.fillText('10 kHz', ((Math.log10(10000) - logMin) / (logMax - logMin)) * cssW + 4, cssH - 5);

          ctx.restore();
        }
      }

      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(rafId);
  }, [getAnalysers, bypass]);

  return (
    <section
      aria-label="Visualization"
      className="bg-[#232528] text-[#F2EFE9] border border-[#34373D] rounded-lg p-5 flex flex-col gap-4"
    >
      <div className="flex items-center justify-between pb-3 border-b border-[#34373D]">
        <h2 className="text-sm font-semibold tracking-wide text-[#F2EFE9]">Visualization</h2>
        <div className="flex items-center gap-2 font-mono text-[11px] text-[#8E939C]">
          <span>Dry</span>
          <span aria-hidden="true">·</span>
          <span className={bypass ? 'text-[#D8D5CE]' : 'text-[#FB923C]'}>
            {bypass ? 'Bypassed' : 'WASM Out'}
          </span>
        </div>
      </div>

      {/* Waveform Scope */}
      <div>
        <div className="flex items-center justify-between text-[11px] text-[#9A9EA6] mb-1.5">
          <span>Waveform Oscilloscope</span>
          <span className="font-mono text-[10px] text-[#7E848E]">Time Domain</span>
        </div>
        <canvas
          ref={waveCanvasRef}
          className="w-full h-28 rounded border border-[#32363C] block"
        />
      </div>

      {/* Frequency Spectrum */}
      <div>
        <div className="flex items-center justify-between text-[11px] text-[#9A9EA6] mb-1.5">
          <span>Spectral Analyzer</span>
          <span className="font-mono text-[10px] text-[#7E848E]">FFT 2048 · 30 Hz – 20 kHz</span>
        </div>
        <canvas
          ref={specCanvasRef}
          className="w-full h-28 rounded border border-[#32363C] block"
        />
      </div>

      {/* Stereo Input & Output Meters */}
      <div className="bg-[#1A1C1F] border border-[#32363C] rounded-md p-3.5 flex flex-col gap-3">
        <div>
          <div className="text-[11px] font-medium text-[#9A9EA6] mb-1.5">Input Stereo (dBFS)</div>
          <div className="space-y-1.5">
            <MeterBar label="L" peak={telemetry?.peakInL ?? 0} rms={telemetry?.rmsInL ?? 0} />
            <MeterBar label="R" peak={telemetry?.peakInR ?? 0} rms={telemetry?.rmsInR ?? 0} />
          </div>
        </div>
        <div className="pt-2.5 border-t border-[#2A2D33]">
          <div className="text-[11px] font-medium text-[#9A9EA6] mb-1.5">Output Stereo (dBFS)</div>
          <div className="space-y-1.5">
            <MeterBar label="L" peak={telemetry?.peakOutL ?? 0} rms={telemetry?.rmsOutL ?? 0} />
            <MeterBar label="R" peak={telemetry?.peakOutR ?? 0} rms={telemetry?.rmsOutR ?? 0} />
          </div>
        </div>
      </div>

      {/* Effect-Specific Real-Time DSP Telemetry */}
      <EffectTelemetryReadout effectId={effectId} telemetry={telemetry} />
    </section>
  );
};
