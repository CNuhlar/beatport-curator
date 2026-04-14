"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { cn } from "@/lib/utils";

const CROSSFADE_SEC = 3;

// Module-level cache of pre-decoded waveform data. The key is the sample
// URL. Once we've fetched + decoded a track once, subsequent loads can
// skip both the fetch AND the Web Audio decodeAudioData step — they
// combined account for most of the ~1s lag between tracks. With peaks
// and duration supplied, WaveSurfer's load() just calls setSrc (cached
// by the browser HTTP layer) and fires `ready` immediately, which means
// play() kicks in right away.
//
// Peaks are downsampled to PREFETCH_BUCKETS values per channel — that's
// plenty of resolution for the bar rendering and keeps memory per track
// under ~32KB even for stereo.
const PREFETCH_BUCKETS = 2048;
const MAX_CACHE_ENTRIES = 10;

interface PrefetchEntry {
  peaks: Float32Array[];
  duration: number;
}

const prefetchCache = new Map<string, PrefetchEntry>();
const pendingPrefetch = new Set<string>();

function evictIfFull() {
  while (prefetchCache.size > MAX_CACHE_ENTRIES) {
    const firstKey = prefetchCache.keys().next().value;
    if (!firstKey) break;
    prefetchCache.delete(firstKey);
  }
}

function downsamplePeaks(channel: Float32Array, buckets: number): Float32Array {
  if (channel.length <= buckets) return channel;
  const out = new Float32Array(buckets);
  const step = channel.length / buckets;
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(channel[j]);
      if (v > max) max = v;
    }
    out[i] = max;
  }
  return out;
}

async function prefetchTrack(url: string): Promise<void> {
  if (!url || prefetchCache.has(url) || pendingPrefetch.has(url)) return;
  pendingPrefetch.add(url);
  try {
    const resp = await fetch(url);
    if (!resp.ok) return;
    const buf = await resp.arrayBuffer();
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      const peaks: Float32Array[] = [];
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        peaks.push(downsamplePeaks(decoded.getChannelData(c), PREFETCH_BUCKETS));
      }
      prefetchCache.set(url, { peaks, duration: decoded.duration });
      evictIfFull();
    } finally {
      ctx.close().catch(() => undefined);
    }
  } catch {
    /* prefetch is best-effort */
  } finally {
    pendingPrefetch.delete(url);
  }
}

export interface WaveformPlayerProps {
  src: string | null;
  /** URL of the upcoming track — pre-decoded so the transition is ~instant. */
  prefetchSrc?: string | null;
  autoPlay?: boolean;
  /** Seconds to add to displayed time labels — e.g. sample_start_ms / 1000. */
  offsetSec?: number;
  onPlayStateChange?: (playing: boolean) => void;
  /** Auto-advance: fires every time the sample finishes. Parent decides
   *  what's next. Fires regardless of autoFade — autoFade only controls
   *  whether to fade out/in across the transition. */
  onEnded?: () => void;
  /** When true: fade out last 5s of current track, fade in first 5s
   *  of the next track after auto-advance. */
  autoFade?: boolean;
  onAutoFadeChange?: (v: boolean) => void;
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function WaveformPlayer({
  src,
  prefetchSrc,
  autoPlay = false,
  offsetSec = 0,
  onPlayStateChange,
  onEnded,
  autoFade = false,
  onAutoFadeChange,
}: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  // Use refs so the ws 'finish' callback (registered once) reads the
  // latest values instead of captured stale ones.
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  // Create wavesurfer instance (once, per container)
  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#404040",
      progressColor: "#00d4ff",
      cursorColor: "#7cff3d",
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      height: 44,
      normalize: true,
      interact: true,
    });

    wsRef.current = ws;

    ws.on("ready", () => {
      setReady(true);
      setDuration(ws.getDuration());
      setError(null);
      // Re-apply any user-set volume/mute to the new audio
      ws.setMuted(muted);
      ws.setVolume(volume);
    });
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => {
      setPlaying(false);
      // Always auto-advance the parent's selection. autoFade just controls
      // whether the fade happens — the advance itself is unconditional.
      onEndedRef.current?.();
    });
    ws.on("timeupdate", (t) => setCurrentTime(t));
    ws.on("error", (e) => {
      setError(e instanceof Error ? e.message : String(e));
      setReady(false);
    });

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync playing state to parent
  useEffect(() => {
    onPlayStateChange?.(playing);
  }, [playing, onPlayStateChange]);

  // Load new src (and auto-play if requested). If the track has already
  // been prefetched + decoded we pass the peaks and duration directly,
  // which lets wavesurfer skip its own fetch and decode passes — 'ready'
  // fires within a frame instead of ~500-800ms later.
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    setReady(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
    if (!src) {
      ws.empty();
      return;
    }
    let cancelled = false;
    const shouldPlay = autoPlay;
    const cached = prefetchCache.get(src);
    const loadPromise = cached
      ? ws.load(src, cached.peaks, cached.duration)
      : ws.load(src);
    loadPromise
      .then(() => {
        if (cancelled) return;
        if (shouldPlay) {
          ws.play().catch(() => undefined);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    // If this src wasn't cached yet, prime it in the background so a
    // future return-visit is also instant.
    if (!cached) {
      void prefetchTrack(src);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Pre-decode the upcoming track as soon as we know what it is. Fire-
  // and-forget — it runs in a microtask and populates prefetchCache.
  useEffect(() => {
    if (!prefetchSrc) return;
    void prefetchTrack(prefetchSrc);
  }, [prefetchSrc]);

  // Apply mute changes live
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !ready) return;
    ws.setMuted(muted);
  }, [muted, ready]);

  // Apply volume changes live. When autoFade is on, additionally fade:
  //   - Out during the last CROSSFADE_SEC of the track
  //   - In during the first CROSSFADE_SEC of a freshly-loaded track
  // Fade is applied AS A MULTIPLIER on the user's volume slider, so
  // dragging the slider during a fade still respects the fade ratio.
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !ready) return;
    let target = volume;
    if (autoFade && duration > 0) {
      const remaining = duration - currentTime;
      if (remaining <= CROSSFADE_SEC && remaining > 0) {
        target = volume * (remaining / CROSSFADE_SEC);
      } else if (currentTime < CROSSFADE_SEC) {
        target = volume * (currentTime / CROSSFADE_SEC);
      }
    }
    ws.setVolume(Math.max(0, Math.min(1, target)));
  }, [volume, currentTime, duration, autoFade, ready]);

  const toggle = () => {
    const ws = wsRef.current;
    if (!ws || !ready) return;
    if (playing) ws.pause();
    else ws.play().catch(() => undefined);
  };

  return (
    <div>
      {/* Single-row transport: play | mute | waveform | time */}
      <div className="flex items-center gap-3">
        {/* Play / pause */}
        <button
          onClick={toggle}
          disabled={!ready || !src}
          className={cn(
            "h-11 w-11 shrink-0 flex items-center justify-center rounded-full transition-colors",
            ready && src
              ? "bg-[var(--accent)] text-black hover:brightness-110"
              : "bg-[var(--border)] text-[var(--fg-mute)] cursor-not-allowed"
          )}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 translate-x-[1px]"
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Mute toggle + hover volume slider */}
        <div className="relative group/vol shrink-0">
          <button
            onClick={() => setMuted((m) => !m)}
            disabled={!ready || !src}
            className={cn(
              "h-9 w-9 flex items-center justify-center rounded-sm border transition-colors",
              muted
                ? "border-[var(--warn)] text-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)]"
                : "border-[var(--border)] text-[var(--fg-dim)] hover:text-[var(--fg)] hover:border-[var(--accent)]"
            )}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <MuteIcon /> : <VolumeIcon />}
          </button>

          {/* Vertical slider popover — appears above the button on hover.
              Outer wrapper has pb-2 padding instead of mb-2 margin so the
              hoverable hit area bridges from the button up to the popover
              without a dead gap that would break group-hover. */}
          <div
            className={cn(
              "absolute bottom-full left-1/2 -translate-x-1/2 pb-2 opacity-0 pointer-events-none",
              "group-hover/vol:opacity-100 group-hover/vol:pointer-events-auto transition-opacity"
            )}
          >
            <div className="bg-[var(--bg-elev-2)] border border-[var(--border)] rounded-sm px-2 py-3 shadow-lg flex flex-col items-center gap-2">
              <span className="text-[10px] font-mono text-[var(--fg-mute)] tabular-nums">
                {Math.round(volume * 100)}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100;
                  setVolume(v);
                  if (muted && v > 0) setMuted(false);
                }}
                style={{ writingMode: "vertical-lr", direction: "rtl" }}
                className="h-28 w-4 appearance-none bg-transparent cursor-pointer
                  [&::-webkit-slider-runnable-track]:w-1 [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:bg-[var(--border)] [&::-webkit-slider-runnable-track]:rounded-sm
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)] [&::-webkit-slider-thumb]:-ml-1
                  [&::-moz-range-track]:w-1 [&::-moz-range-track]:bg-[var(--border)] [&::-moz-range-track]:rounded-sm
                  [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--accent)] [&::-moz-range-thumb]:border-0"
              />
            </div>
          </div>
        </div>

        {/* Waveform canvas — fills remaining width, same height as controls */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 cursor-pointer"
          style={{ minHeight: 44 }}
        />

        {/* Time */}
        <div className="shrink-0 text-[11px] font-mono text-[var(--fg-mute)] tabular-nums whitespace-nowrap">
          {fmtTime(currentTime + offsetSec)} / {fmtTime(duration + offsetSec)}
        </div>

        {/* Auto-fade toggle — far right */}
        {onAutoFadeChange && (
          <button
            type="button"
            role="checkbox"
            aria-checked={autoFade}
            onClick={() => onAutoFadeChange(!autoFade)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 h-9 px-2.5 rounded-sm border text-[10px] font-mono uppercase tracking-wider cursor-pointer transition-colors",
              autoFade
                ? "border-[var(--accent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                : "border-[var(--border)] text-[var(--fg-mute)] hover:text-[var(--fg)] hover:border-[var(--border)]"
            )}
            title="Auto-fade: fade out last 5s, fade in first 5s of the next track"
          >
            <span
              className={cn(
                "h-3 w-3 rounded-[2px] border flex items-center justify-center",
                autoFade
                  ? "border-[var(--accent)] bg-[var(--accent)]"
                  : "border-[var(--border)]"
              )}
            >
              {autoFade && (
                <svg
                  viewBox="0 0 12 12"
                  className="h-2 w-2 text-black"
                  fill="none"
                  strokeWidth="2.5"
                  stroke="currentColor"
                >
                  <path
                    d="M2 6l3 3 5-6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            Auto Fade
          </button>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-[var(--danger)] font-mono mt-1">
          {error}
        </div>
      )}
      {!ready && src && !error && (
        <div className="text-[11px] text-[var(--fg-mute)] font-mono mt-1 animate-pulse">
          loading waveform…
        </div>
      )}
    </div>
  );
}

function VolumeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function MuteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
