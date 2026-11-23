/* SPDX-License-Identifier: GPL-3.0-only
 * Molecular FX Lab — Left Panel: Audio Source & Transport
 */

import React, { useRef, useState } from 'react';
import {
  Download,
  FileAudio,
  Mic,
  MicOff,
  Pause,
  Play,
  Repeat,
  Square,
  Upload,
} from 'lucide-react';
import type { AudioInputDevice, LoadedClipInfo, SourceMode } from '../audio/AudioEngine';
import { BUILTIN_CLIPS, type BuiltinClipId } from '../audio/testSignals';

interface AudioSourcePanelProps {
  sourceMode: SourceMode;
  clipInfo: LoadedClipInfo | null;
  isPlaying: boolean;
  loop: boolean;
  playheadSec: number;
  liveActive: boolean;
  inputDevices: AudioInputDevice[];
  selectedDeviceId: string;
  inputGainDb: number;
  engineReady: boolean;
  exportingWav: boolean;
  onSourceModeChange: (mode: SourceMode) => void;
  onFileUpload: (file: File) => void;
  onLoadBuiltin: (id: BuiltinClipId) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onSeek: (sec: number) => void;
  onSelectDevice: (deviceId: string) => void;
  onRefreshDevices: () => void;
  onInputGainChange: (db: number) => void;
  onExportWav: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00.0';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const tenths = Math.floor((sec - Math.floor(sec)) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
}

export const AudioSourcePanel: React.FC<AudioSourcePanelProps> = ({
  sourceMode,
  clipInfo,
  isPlaying,
  loop,
  playheadSec,
  liveActive,
  inputDevices,
  selectedDeviceId,
  inputGainDb,
  engineReady,
  exportingWav,
  onSourceModeChange,
  onFileUpload,
  onLoadBuiltin,
  onTogglePlay,
  onStop,
  onToggleLoop,
  onSeek,
  onSelectDevice,
  onRefreshDevices,
  onInputGainChange,
  onExportWav,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFileUpload(file);
  };

  const handleWaveClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!clipInfo || clipInfo.duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * clipInfo.duration);
  };

  const progressRatio = clipInfo && clipInfo.duration > 0 ? Math.min(1, playheadSec / clipInfo.duration) : 0;

  return (
    <section
      aria-label="Audio Source"
      className="bg-[#232528] text-[#F2EFE9] border border-[#34373D] rounded-lg p-5 flex flex-col gap-5"
    >
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#34373D]">
        <h2 className="text-sm font-semibold tracking-wide text-[#F2EFE9]">Audio Source</h2>
        <div className="flex items-center bg-[#181A1D] p-1 rounded border border-[#32363C]">
          <button
            type="button"
            onClick={() => onSourceModeChange('file')}
            className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              sourceMode === 'file'
                ? 'bg-[#EA580C] text-white'
                : 'text-[#A2A6AE] hover:text-[#F2EFE9]'
            }`}
          >
            File
          </button>
          <button
            type="button"
            onClick={() => onSourceModeChange('live')}
            className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              sourceMode === 'live'
                ? 'bg-[#EA580C] text-white'
                : 'text-[#A2A6AE] hover:text-[#F2EFE9]'
            }`}
          >
            Live In
          </button>
        </div>
      </div>

      {sourceMode === 'file' ? (
        <>
          {/* File Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border border-dashed rounded-md p-4 transition-colors ${
              dragging
                ? 'border-[#F97316] bg-[#EA580C]/10'
                : 'border-[#41454D] bg-[#1C1E21] hover:border-[#626873]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aiff"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFileUpload(file);
                e.target.value = '';
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium text-[#F2EFE9]">
                  <FileAudio className="w-4 h-4 text-[#F97316] shrink-0" />
                  <span className="truncate">{clipInfo ? clipInfo.name : 'No audio loaded'}</span>
                </div>
                <p className="text-[11px] font-mono text-[#8E939C] mt-1 tabular-nums">
                  {clipInfo
                    ? `${clipInfo.channels === 1 ? 'Mono' : `${clipInfo.channels} ch`} · ${(clipInfo.sampleRate / 1000).toFixed(1)} kHz · ${clipInfo.duration.toFixed(2)} s`
                    : 'Drop WAV, MP3, FLAC, or OGG file here'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#2D3036] hover:bg-[#383C44] text-[#F2EFE9] border border-[#42464F] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Load File
              </button>
            </div>
          </div>

          {/* Static waveform scrubber */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-mono text-[#9A9EA6] mb-1.5 tabular-nums">
              <span>{formatTime(playheadSec)}</span>
              <span>{clipInfo ? formatTime(clipInfo.duration) : '0:00.0'}</span>
            </div>
            <div
              role="slider"
              aria-label="Audio timeline position"
              aria-valuemin={0}
              aria-valuemax={clipInfo ? Math.round(clipInfo.duration * 100) : 100}
              aria-valuenow={Math.round(playheadSec * 100)}
              tabIndex={0}
              onClick={handleWaveClick}
              className="relative h-16 w-full bg-[#17191C] border border-[#32363C] rounded overflow-hidden cursor-pointer"
            >
              {clipInfo ? (
                <svg
                  viewBox={`0 0 ${clipInfo.peaks.length} 64`}
                  preserveAspectRatio="none"
                  className="w-full h-full block"
                >
                  <line x1="0" y1="32" x2={clipInfo.peaks.length} y2="32" stroke="#292C32" strokeWidth="1" />
                  {Array.from(clipInfo.peaks).map((pk, idx) => {
                    const h = Math.max(1.5, pk * 28);
                    const played = idx / clipInfo.peaks.length <= progressRatio;
                    return (
                      <line
                        key={idx}
                        x1={idx + 0.5}
                        y1={32 - h}
                        x2={idx + 0.5}
                        y2={32 + h}
                        stroke={played ? '#F97316' : '#585E69'}
                        strokeWidth="0.9"
                      />
                    );
                  })}
                </svg>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-[#6F747E]">
                  Load a file or pick an audition signal below
                </div>
              )}
              {clipInfo && (
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-[#F5F2EC] pointer-events-none"
                  style={{ left: `${progressRatio * 100}%` }}
                />
              )}
            </div>
          </div>

          {/* Transport Controls */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={!clipInfo}
              onClick={onTogglePlay}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isPlaying
                  ? 'bg-[#EA580C] text-white hover:bg-[#DC4F08]'
                  : 'bg-[#F2EFE9] text-[#1D1F22] hover:bg-white'
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              disabled={!clipInfo}
              onClick={onStop}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded text-xs font-medium bg-[#2B2E34] hover:bg-[#353940] text-[#F2EFE9] border border-[#3C4048] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
            <button
              type="button"
              onClick={onToggleLoop}
              aria-pressed={loop}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                loop
                  ? 'bg-[#EA580C]/20 text-[#FB923C] border-[#EA580C]'
                  : 'bg-[#2B2E34] text-[#9A9EA6] border-[#3C4048] hover:text-[#F2EFE9]'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
              Loop
            </button>
          </div>

          {/* Quick Audition Test Sources */}
          <div className="pt-2 border-t border-[#32363C]">
            <div className="text-[11px] font-medium text-[#9A9EA6] mb-2">Built-in Audition Signals</div>
            <div className="flex flex-col gap-1.5">
              {BUILTIN_CLIPS.map((clip) => (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => onLoadBuiltin(clip.id)}
                  className="text-left px-3 py-2 rounded bg-[#1C1E21] hover:bg-[#2A2D33] border border-[#32363C] transition-colors cursor-pointer"
                >
                  <div className="text-xs font-medium text-[#F2EFE9]">{clip.label}</div>
                  <div className="text-[11px] text-[#8E939C] truncate">{clip.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Offline Deterministic WAV Export */}
          <button
            type="button"
            disabled={!clipInfo || !engineReady || exportingWav}
            onClick={onExportWav}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded text-xs font-medium bg-[#1C1E21] hover:bg-[#2A2D33] text-[#D8D5CE] border border-[#383C44] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5 text-[#F97316]" />
            {exportingWav ? 'Rendering WASM WAV...' : 'Export Processed WAV (WASM)'}
          </button>
        </>
      ) : (
        /* Live Microphone / Audio Interface Mode */
        <div className="flex flex-col gap-4">
          <div className="bg-[#1C1E21] border border-[#32363C] rounded-md p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                {liveActive ? (
                  <Mic className="w-4 h-4 text-[#F97316]" />
                ) : (
                  <MicOff className="w-4 h-4 text-[#8E939C]" />
                )}
                <span className="text-xs font-semibold text-[#F2EFE9]">
                  {liveActive ? 'Live Input Active' : 'Live Input Disconnected'}
                </span>
              </div>
              <button
                type="button"
                onClick={onRefreshDevices}
                className="text-[11px] text-[#FB923C] hover:underline cursor-pointer"
              >
                Refresh Devices
              </button>
            </div>

            <label className="block text-[11px] text-[#9A9EA6] mb-1.5" htmlFor="audio-input-device">
              Capture Interface / Microphone
            </label>
            <select
              id="audio-input-device"
              value={selectedDeviceId}
              onChange={(e) => onSelectDevice(e.target.value)}
              className="w-full bg-[#15171A] border border-[#3C4048] rounded px-2.5 py-2 text-xs text-[#F2EFE9] focus-visible:outline-2 focus-visible:outline-[#F97316]"
            >
              {inputDevices.length === 0 ? (
                <option value="">Default System Audio Input</option>
              ) : (
                inputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))
              )}
            </select>

            <p className="text-[11px] text-[#9A9EA6] mt-3 leading-relaxed">
              Raw capture mode disables browser AEC, noise suppression, and AGC. Use headphones to prevent acoustic feedback loops.
            </p>
          </div>
        </div>
      )}

      {/* Input Gain Fader */}
      <div className="mt-auto pt-4 border-t border-[#34373D]">
        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="input-gain-slider" className="text-xs font-medium text-[#D8D5CE]">
            Input Gain
          </label>
          <span className="font-mono text-xs text-[#F2EFE9] tabular-nums">
            {inputGainDb >= 0 ? `+${inputGainDb.toFixed(1)}` : inputGainDb.toFixed(1)} dB
          </span>
        </div>
        <input
          id="input-gain-slider"
          type="range"
          min={-24}
          max={12}
          step={0.5}
          value={inputGainDb}
          onChange={(e) => onInputGainChange(parseFloat(e.target.value))}
          onDoubleClick={() => onInputGainChange(0)}
          className="studio-fader w-full"
        />
        <div className="flex justify-between font-mono text-[10px] text-[#7E848E] mt-1 tabular-nums">
          <span>-24 dB</span>
          <span>0 dB</span>
          <span>+12 dB</span>
        </div>
      </div>
    </section>
  );
};
