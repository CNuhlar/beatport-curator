"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WaveformPlayer } from "./waveform-player";
import { cn } from "@/lib/utils";

interface BeatportDetails {
  id: number;
  name: string;
  mix_name?: string | null;
  bpm?: number | null;
  artists?: Array<{ name: string }>;
  key?: { camelot_number?: number; camelot_letter?: string };
  release?: { image?: { uri?: string } };
  image?: { uri?: string };
  sample_url?: string | null;
  sample_start_ms?: number | null;
}

async function fetchTrackDetails(id: number): Promise<BeatportDetails> {
  const r = await fetch(`/api/tracks/${id}`);
  if (!r.ok) throw new Error("failed to load");
  return r.json();
}

export interface BottomPlayerProps {
  trackId: number | null;
  autoPlay?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  /** Called when the current sample finishes. Parent should advance its
   *  selectedTrackId to the next track in the list (auto-advance is
   *  always on — auto-fade only controls the volume ramps). */
  onEnded?: () => void;
  /** ID of the NEXT track in the parent's list. Used for background
   *  prefetch so the auto-advance transition is seamless — the MP3
   *  bytes are already in the browser HTTP cache when we jump. */
  nextTrackId?: number | null;
  /** Manual prev/next navigation — prev button disabled if onPrev is
   *  null, next button disabled if onNext is null. */
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
}

/**
 * Fixed-bottom player bar used at the base of the center column on
 * /build and /library. Stays visible while the page content scrolls.
 * Fetches track details on trackId change (react-query cached, deduped
 * with other fetches of the same id like PreviewPanel).
 */
export function BottomPlayer({
  trackId,
  autoPlay = true,
  onPlayingChange,
  onEnded,
  nextTrackId,
  onPrev,
  onNext,
}: BottomPlayerProps) {
  const [autoFade, setAutoFade] = useState(false);

  // Current track details (shown in the player bar, used by waveform)
  const { data } = useQuery({
    queryKey: ["track-detail", trackId],
    queryFn: () => fetchTrackDetails(trackId!),
    enabled: trackId != null,
    staleTime: 60_000,
  });

  // Next track details — prefetched in the background, same react-query
  // key so when the parent advances selectedTrackId the JSON is already
  // cached. Zero extra network on advance.
  const { data: nextData } = useQuery({
    queryKey: ["track-detail", nextTrackId],
    queryFn: () => fetchTrackDetails(nextTrackId!),
    enabled: nextTrackId != null,
    staleTime: 60_000,
  });

  // The actual prefetch (mp3 fetch + Web Audio decode + peaks cache)
  // now lives in WaveformPlayer — we just pass the next track's sample
  // URL down and the player handles pre-decoding off the main thread.

  if (trackId == null) {
    return (
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-elev)] px-6 py-5">
        <div className="text-center text-xs font-mono text-[var(--fg-mute)]">
          no track selected — click a row to preview
        </div>
      </div>
    );
  }

  const artists = (data?.artists ?? []).map((a) => a.name).join(", ");
  const camelot =
    data?.key?.camelot_number && data?.key?.camelot_letter
      ? `${data.key.camelot_number}${data.key.camelot_letter}`
      : null;
  const imageUrl = data?.release?.image?.uri ?? data?.image?.uri ?? null;
  const mix =
    data?.mix_name && data.mix_name !== "Original Mix"
      ? ` (${data.mix_name})`
      : "";

  return (
    <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-elev)] px-5 py-3">
      <div className="flex items-center gap-4">
        {/* Track info */}
        <div className="flex items-center gap-3 w-[260px] shrink-0 min-w-0">
          <div
            className="h-12 w-12 shrink-0 rounded-sm bg-[var(--border-soft)] bg-cover bg-center"
            style={
              imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined
            }
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-[var(--fg-dim)] truncate">
              {artists || "—"}
            </div>
            <div className="text-sm text-[var(--fg)] truncate font-medium">
              {data?.name ?? "Loading…"}
              {mix && (
                <span className="text-[var(--fg-mute)]"> {mix}</span>
              )}
            </div>
            <div className="text-[10px] font-mono text-[var(--fg-mute)] mt-0.5">
              {data?.bpm ? `${data.bpm} bpm` : "? bpm"}
              {camelot && ` · ${camelot}`}
            </div>
          </div>
        </div>

        {/* Prev / next — playlist navigation */}
        <div className="flex items-center gap-1 shrink-0">
          <NavButton
            disabled={!onPrev}
            onClick={() => onPrev?.()}
            aria-label="Previous track"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M6 6h2v12H6zM9.5 12l8.5 6V6z" />
            </svg>
          </NavButton>
          <NavButton
            disabled={!onNext}
            onClick={() => onNext?.()}
            aria-label="Next track"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M6 18l8.5-6L6 6zM16 6h2v12h-2z" />
            </svg>
          </NavButton>
        </div>

        {/* Waveform + controls — fills remaining width */}
        <div className="flex-1 min-w-0">
          <WaveformPlayer
            src={data?.sample_url ?? null}
            prefetchSrc={nextData?.sample_url ?? null}
            autoPlay={autoPlay}
            offsetSec={(data?.sample_start_ms ?? 0) / 1000}
            onPlayStateChange={onPlayingChange}
            onEnded={onEnded}
            autoFade={autoFade}
            onAutoFadeChange={setAutoFade}
          />
        </div>
      </div>
    </div>
  );
}

function NavButton({
  disabled,
  onClick,
  children,
  ...rest
}: {
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-9 w-9 flex items-center justify-center rounded-sm border transition-colors",
        disabled
          ? "border-[var(--border-soft)] text-[var(--fg-mute)] cursor-not-allowed opacity-50"
          : "border-[var(--border)] text-[var(--fg-dim)] hover:text-[var(--fg)] hover:border-[var(--accent)] cursor-pointer"
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
