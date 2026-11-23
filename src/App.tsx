/* SPDX-License-Identifier: GPL-3.0-only
 * Molecular FX Lab — Main Application Shell
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Volume2 } from 'lucide-react';
import {
  type AudioInputDevice,
  type EngineInfo,
  type LoadedClipInfo,
  MolecularAudioEngine,
  type SourceMode,
  type TelemetryFrame,
} from './audio/AudioEngine';
import type { BuiltinClipId } from './audio/testSignals';
import { EFFECTS_CATALOG, type EffectId, type EffectPreset, getEffectMeta } from './effects/catalog';
import { AudioSourcePanel } from './components/AudioSourcePanel';
import { EffectEnginePanel } from './components/EffectEnginePanel';
import { SignalVisualizer } from './visualization/SignalVisualizer';

export function App() {
  const engineRef = useRef<MolecularAudioEngine | null>(null);
  const telemetryRef = useRef<TelemetryFrame | null>(null);

  const [engineInfo, setEngineInfo] = useState<EngineInfo>({
    status: 'idle',
    errorMessage: null,
    hostSampleRate: 0,
    nativeSampleRate: 44100,
    blockSize: 32,
    latencySamples: 0,
    baseLatencyMs: 0,
    resampling: false,
    wasmBytesSize: 0,
    effectCount: EFFECTS_CATALOG.length,
    workletState: 'uninitialized',
  });
  const [telemetry, setTelemetry] = useState<TelemetryFrame | null>(null);
  const [appAlert, setAppAlert] = useState<string | null>(null);

  // Source & transport state
  const [sourceMode, setSourceMode] = useState<SourceMode>('file');
  const [clipInfo, setClipInfo] = useState<LoadedClipInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [liveActive, setLiveActive] = useState(false);
  const [inputDevices, setInputDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [inputGainDb, setInputGainDb] = useState(0);
  const [exportingWav, setExportingWav] = useState(false);

  // Effect DSP state
  const [effectId, setEffectId] = useState<EffectId>(0);
  const [params, setParams] = useState<[number, number, number, number]>([50, 30, 45, 40]);
  const [rootNote, setRootNote] = useState(48);
  const [mix, setMix] = useState(0.65);
  const [bypass, setBypass] = useState(false);
  const [outputGainDb, setOutputGainDb] = useState(0);
  const [guardEnabled, setGuardEnabled] = useState(true);
  const [stereoDecorrelate, setStereoDecorrelate] = useState(false);

  // Initialize singleton engine instance
  useEffect(() => {
    const engine = new MolecularAudioEngine();
    engineRef.current = engine;
    engine.setCallbacks({
      onInfoChange: (info) => setEngineInfo(info),
      onTelemetry: (frame) => {
        telemetryRef.current = frame;
        setTelemetry(frame);
      },
      onTransportEnd: () => {
        setIsPlaying(false);
        setPlayheadSec(0);
      },
    });
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Poll playhead at animation frame cadence while playing
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      const eng = engineRef.current;
      if (eng) {
        const pos = eng.getPlaybackPosition();
        setPlayheadSec(pos.current);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [isPlaying]);

  const getAnalysers = useCallback(() => {
    return engineRef.current?.getAnalysers() ?? { pre: null, post: null };
  }, []);

  const handleInitAndLoadDefault = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng) return;
    setAppAlert(null);
    const ok = await eng.ensureInitialized();
    if (!ok) return;
    if (!clipInfo) {
      try {
        const loaded = await eng.loadBuiltinClip('plucks');
        setClipInfo(loaded);
        setPlayheadSec(0);
        const started = await eng.playFile();
        setIsPlaying(started);
      } catch (err) {
        setAppAlert(err instanceof Error ? err.message : String(err));
      }
    }
  }, [clipInfo]);

  const handleFileUpload = useCallback(async (file: File) => {
    const eng = engineRef.current;
    if (!eng) return;
    setAppAlert(null);
    try {
      const info = await eng.loadAudioFile(file);
      setClipInfo(info);
      setPlayheadSec(0);
      setIsPlaying(false);
      setSourceMode('file');
      setLiveActive(false);
    } catch (err) {
      setAppAlert(
        `Could not decode "${file.name}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, []);

  const handleLoadBuiltin = useCallback(async (id: BuiltinClipId) => {
    const eng = engineRef.current;
    if (!eng) return;
    setAppAlert(null);
    try {
      const info = await eng.loadBuiltinClip(id);
      setClipInfo(info);
      setPlayheadSec(0);
      setSourceMode('file');
      setLiveActive(false);
      const started = await eng.playFile();
      setIsPlaying(started);
    } catch (err) {
      setAppAlert(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleTogglePlay = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng || !clipInfo) return;
    setAppAlert(null);
    if (isPlaying) {
      eng.pauseFile();
      setIsPlaying(false);
    } else {
      const started = await eng.playFile();
      setIsPlaying(started);
    }
  }, [clipInfo, isPlaying]);

  const handleStop = useCallback(() => {
    engineRef.current?.stopFile();
    setIsPlaying(false);
    setPlayheadSec(0);
  }, []);

  const handleToggleLoop = useCallback(() => {
    setLoop((prev) => {
      const next = !prev;
      engineRef.current?.setLoop(next);
      return next;
    });
  }, []);

  const handleSeek = useCallback((sec: number) => {
    engineRef.current?.seekFile(sec);
    setPlayheadSec(sec);
  }, []);

  const refreshDevices = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng) return;
    try {
      const list = await eng.listInputDevices();
      setInputDevices(list);
      if (list.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(list[0].deviceId);
      }
    } catch (err) {
      setAppAlert(err instanceof Error ? err.message : String(err));
    }
  }, [selectedDeviceId]);

  const handleSourceModeChange = useCallback(
    async (mode: SourceMode) => {
      const eng = engineRef.current;
      if (!eng) return;
      setAppAlert(null);
      setSourceMode(mode);
      try {
        if (mode === 'live') {
          setIsPlaying(false);
          await eng.setSourceMode('live', selectedDeviceId || undefined);
          setLiveActive(eng.isLiveActive());
          await refreshDevices();
        } else {
          await eng.setSourceMode('file');
          setLiveActive(false);
        }
      } catch (err) {
        setLiveActive(false);
        setAppAlert(`Live input error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [refreshDevices, selectedDeviceId]
  );

  const handleSelectDevice = useCallback(async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    const eng = engineRef.current;
    if (!eng) return;
    setAppAlert(null);
    try {
      await eng.startLiveInput(deviceId || undefined);
      setLiveActive(eng.isLiveActive());
    } catch (err) {
      setLiveActive(false);
      setAppAlert(`Could not switch input device: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleSelectEffect = useCallback((id: EffectId) => {
    const meta = getEffectMeta(id);
    const nextParams: [number, number, number, number] = [
      meta.params[0].defaultValue,
      meta.params[1].defaultValue,
      meta.params[2].defaultValue,
      meta.params[3].defaultValue,
    ];
    setEffectId(id);
    setParams(nextParams);
    engineRef.current?.selectEffect(id, nextParams);
  }, []);

  const handleParamChange = useCallback((index: 0 | 1 | 2 | 3, value: number) => {
    setParams((prev) => {
      const next: [number, number, number, number] = [...prev];
      next[index] = value;
      return next;
    });
    engineRef.current?.setParam(index, value);
  }, []);

  const handleRootNoteChange = useCallback((midiNote: number) => {
    const clamped = Math.max(24, Math.min(84, Math.round(midiNote)));
    setRootNote(clamped);
    engineRef.current?.setRootNote(clamped);
  }, []);

  const handleApplyPreset = useCallback((preset: EffectPreset) => {
    setParams([...preset.params]);
    setMix(preset.mix);
    const eng = engineRef.current;
    if (eng) {
      for (let i = 0; i < 4; i++) {
        eng.setParam(i as 0 | 1 | 2 | 3, preset.params[i]);
      }
      eng.setMix(preset.mix);
    }
  }, []);

  const handleMixChange = useCallback((nextMix: number) => {
    setMix(nextMix);
    engineRef.current?.setMix(nextMix);
  }, []);

  const handleToggleBypass = useCallback(() => {
    setBypass((prev) => {
      const next = !prev;
      engineRef.current?.setBypass(next);
      return next;
    });
  }, []);

  const handleInputGainChange = useCallback((db: number) => {
    setInputGainDb(db);
    engineRef.current?.setInputGainDb(db);
  }, []);

  const handleOutputGainChange = useCallback((db: number) => {
    setOutputGainDb(db);
    engineRef.current?.setOutputGainDb(db);
  }, []);

  const handleToggleGuard = useCallback(() => {
    setGuardEnabled((prev) => {
      const next = !prev;
      engineRef.current?.setGuardEnabled(next);
      return next;
    });
  }, []);

  const handleToggleDecorrelate = useCallback(() => {
    setStereoDecorrelate((prev) => {
      const next = !prev;
      engineRef.current?.setStereoDecorrelate(next);
      return next;
    });
  }, []);

  const handleResetState = useCallback(() => {
    engineRef.current?.resetDspState();
  }, []);

  const handleExportWav = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng) return;
    setExportingWav(true);
    setAppAlert(null);
    try {
      const { blob, filename } = await eng.exportProcessedWav();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setAppAlert(err instanceof Error ? err.message : String(err));
    } finally {
      setExportingWav(false);
    }
  }, []);

  // Keyboard shortcuts (Space = Play/Pause, B = Bypass, [ / ] = Prev/Next FX, 1/2/3 = MVP FX)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space' && sourceMode === 'file' && clipInfo) {
        e.preventDefault();
        void handleTogglePlay();
      } else if (e.key === 'b' || e.key === 'B') {
        handleToggleBypass();
      } else if (e.key === '[') {
        handleSelectEffect((effectId - 1 + EFFECTS_CATALOG.length) % EFFECTS_CATALOG.length);
      } else if (e.key === ']') {
        handleSelectEffect((effectId + 1) % EFFECTS_CATALOG.length);
      } else if (e.key === '1') {
        handleSelectEffect(0);
      } else if (e.key === '2') {
        handleSelectEffect(1);
      } else if (e.key === '3') {
        handleSelectEffect(2);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clipInfo, effectId, handleSelectEffect, handleToggleBypass, handleTogglePlay, sourceMode]);

  // Compute real total estimated latency (AudioContext + WASM adapter)
  const dspAdapterMs =
    engineInfo.hostSampleRate > 0
      ? (engineInfo.latencySamples / engineInfo.hostSampleRate) * 1000
      : 0;
  const totalLatencyMs = engineInfo.baseLatencyMs + dspAdapterMs;

  const signalActive =
    (telemetry?.peakOutL ?? 0) > 0.002 ||
    (telemetry?.peakOutR ?? 0) > 0.002 ||
    (telemetry?.peakInL ?? 0) > 0.002;

  const engineStatusLabel =
    engineInfo.status === 'ready'
      ? `● WASM Ready (${(engineInfo.wasmBytesSize / 1024).toFixed(1)} KiB)`
      : engineInfo.status === 'loading'
        ? '◌ Loading WASM...'
        : engineInfo.status === 'error'
          ? '✖ WASM Unavailable'
          : '○ Standby (Click Start or Play)';

  const engineStatusColor =
    engineInfo.status === 'ready'
      ? 'text-[#15803D]'
      : engineInfo.status === 'error'
        ? 'text-[#B91C1C]'
        : 'text-[#6B6E75]';

  return (
    <div className="min-h-screen bg-[#F5F2EC] text-[#1D1F22] flex flex-col">
      {/* Header Bar */}
      <header className="border-b border-[#DCD7CE] bg-[#FAF8F4]">
        <div className="max-w-[1440px] mx-auto px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
          {/* Brand Wordmark */}
          <div className="flex items-baseline gap-3 shrink-0">
            <h1 className="text-lg font-bold tracking-tight text-[#1A1C1F] whitespace-nowrap">
              Molecular FX Lab
            </h1>
            <span className="hidden sm:inline font-mono text-xs text-[#6B6E75]">
              {engineInfo.effectCount} Atoms · Q15 C99 · Emscripten WASM
            </span>
          </div>

          {/* Live Technical Readouts (Clean Unboxed Metadata) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-[#4A4E55] tabular-nums">
            <span className={`font-medium ${engineStatusColor}`}>{engineStatusLabel}</span>
            <span aria-hidden="true" className="text-[#C5BFB4]">·</span>
            <span>
              {engineInfo.hostSampleRate > 0
                ? engineInfo.resampling
                  ? `${(engineInfo.hostSampleRate / 1000).toFixed(1)} kHz → 44.1 kHz`
                  : `${(engineInfo.hostSampleRate / 1000).toFixed(1)} kHz native`
                : '44.1 kHz core'}
            </span>
            <span aria-hidden="true" className="text-[#C5BFB4]">·</span>
            <span>
              Latency {engineInfo.status === 'ready' ? `${totalLatencyMs.toFixed(1)} ms` : '—'}
            </span>
            <span aria-hidden="true" className="text-[#C5BFB4]">·</span>
            <span className={signalActive ? 'text-[#EA580C] font-medium' : 'text-[#7A7E86]'}>
              {signalActive ? '▲ Signal Active' : 'Idle'}
            </span>
          </div>

          {/* Primary Action */}
          <div className="shrink-0">
            {engineInfo.status !== 'ready' ? (
              <button
                type="button"
                onClick={handleInitAndLoadDefault}
                disabled={engineInfo.status === 'loading'}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#EA580C] hover:bg-[#DC4F08] text-white rounded transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <Volume2 className="w-3.5 h-3.5" />
                {engineInfo.status === 'loading' ? 'Initializing...' : 'Start Engine & Audition'}
              </button>
            ) : (
              <span className="font-mono text-xs text-[#595D66] whitespace-nowrap">
                Keys: Space Play · B Bypass · [ ] FX
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Explicit Error / Technical Alert Banner (Never silent on WASM failure) */}
      {(engineInfo.errorMessage || appAlert) && (
        <div
          role="alert"
          className="bg-[#FEF2F2] border-b border-[#FECACA] text-[#991B1B]"
        >
          <div className="max-w-[1440px] mx-auto px-5 py-2.5 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="font-medium">{engineInfo.errorMessage ?? appAlert}</span>
            </div>
            {appAlert && !engineInfo.errorMessage && (
              <button
                type="button"
                onClick={() => setAppAlert(null)}
                className="font-mono text-[11px] underline cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main 3-Column Studio Workspace */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-5 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left Panel: Audio Source */}
          <div className="lg:col-span-3 flex flex-col">
            <div className="flex-1 flex flex-col [&>section]:flex-1">
              <AudioSourcePanel
                sourceMode={sourceMode}
                clipInfo={clipInfo}
                isPlaying={isPlaying}
                loop={loop}
                playheadSec={playheadSec}
                liveActive={liveActive}
                inputDevices={inputDevices}
                selectedDeviceId={selectedDeviceId}
                inputGainDb={inputGainDb}
                engineReady={engineInfo.status === 'ready'}
                exportingWav={exportingWav}
                onSourceModeChange={handleSourceModeChange}
                onFileUpload={handleFileUpload}
                onLoadBuiltin={handleLoadBuiltin}
                onTogglePlay={handleTogglePlay}
                onStop={handleStop}
                onToggleLoop={handleToggleLoop}
                onSeek={handleSeek}
                onSelectDevice={handleSelectDevice}
                onRefreshDevices={refreshDevices}
                onInputGainChange={handleInputGainChange}
                onExportWav={handleExportWav}
              />
            </div>
          </div>

          {/* Center Panel: Effect Engine */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="flex-1 flex flex-col [&>section]:flex-1">
              <EffectEnginePanel
                effectId={effectId}
                params={params}
                rootNote={rootNote}
                mix={mix}
                bypass={bypass}
                outputGainDb={outputGainDb}
                guardEnabled={guardEnabled}
                stereoDecorrelate={stereoDecorrelate}
                onSelectEffect={handleSelectEffect}
                onParamChange={handleParamChange}
                onRootNoteChange={handleRootNoteChange}
                onApplyPreset={handleApplyPreset}
                onMixChange={handleMixChange}
                onToggleBypass={handleToggleBypass}
                onOutputGainChange={handleOutputGainChange}
                onToggleGuard={handleToggleGuard}
                onToggleDecorrelate={handleToggleDecorrelate}
                onResetState={handleResetState}
              />
            </div>
          </div>

          {/* Right Panel: Visualization */}
          <div className="lg:col-span-4 flex flex-col">
            <div className="flex-1 flex flex-col [&>section]:flex-1">
              <SignalVisualizer
                effectId={effectId}
                getAnalysers={getAnalysers}
                telemetryRef={telemetryRef}
                telemetry={telemetry}
                bypass={bypass}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Footer: Real AudioWorklet State, Processing Stats & GPL-3.0-only Attribution */}
      <footer className="border-t border-[#DCD7CE] bg-[#EFECE5] text-[#555961]">
        <div className="max-w-[1440px] mx-auto px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums">
            <span>
              AudioWorklet: <strong className="text-[#232528] font-medium">{engineInfo.workletState}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>DSP Core: CTL={engineInfo.blockSize} @ {engineInfo.nativeSampleRate} Hz</span>
            <span aria-hidden="true">·</span>
            <span>
              Quanta: {(telemetry?.blocksProcessed ?? 0).toLocaleString()}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Adapter FIFO: {engineInfo.latencySamples} samp
              {engineInfo.resampling ? ' (Hermite 4-pt)' : ' (Direct 1:1)'}
            </span>
          </div>

          <div className="text-[11px] text-[#666A73]">
            Upstream DSP: Molecular / Norilsk / Tonitor by Nuno Zimas · GPL-3.0-only
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
