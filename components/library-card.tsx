"use client";

import { cn } from "@/lib/utils";
import type { Track } from "@/lib/sync";

export function LibraryCard({
  track,
  selected,
  playing,
  onSelect,
  onPlayToggle,
}: {
  track: Track;
  selected: boolean;
  playing: boolean;
  onSelect: () => void;
  onPlayToggle: () => void;
}) {
  const artists = (track.artists as string[]).join(", ");
  const mix =
    track.mix_name && track.mix_name !== "Original Mix"
      ? ` (${track.mix_name})`
      : "";

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group border bg-[var(--bg-elev)] hover:bg-[var(--bg-elev-2)] rounded-sm p-2 pr-3 flex items-stretch gap-3 cursor-pointer transition-colors",
        selected
          ? "border-[var(--accent)]"
          : "border-[var(--border-soft)] hover:border-[var(--border)]"
      )}
    >
      {/* Album art + play overlay */}
      <div
        className="relative h-14 w-14 shrink-0 bg-[var(--border-soft)] rounded-sm overflow-hidden"
        style={
          track.image_url
            ? {
                backgroundImage: `url(${track.image_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlayToggle();
          }}
          disabled={!track.sample_url}
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity",
            playing
              ? "bg-black/50 opacity-100"
              : "bg-black/40 opacity-0 group-hover:opacity-100 hover:bg-black/60",
            !track.sample_url && "!opacity-0 cursor-not-allowed"
          )}
          aria-label={playing ? "Pause preview" : "Play preview"}
        >
          {playing ? (
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-white drop-shadow"
              fill="currentColor"
            >
              <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-white drop-shadow"
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <div className="text-xs text-[var(--fg-dim)] truncate">{artists}</div>
          <div className="text-sm text-[var(--fg)] truncate">
            {track.name}
            <span className="text-[var(--fg-mute)]">{mix}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {track.bpm && (
            <span className="chip font-mono">{track.bpm} bpm</span>
          )}
          {track.camelot && (
            <span className="chip chip-accent-2 font-mono">{track.camelot}</span>
          )}
          {(track.sub_genre || track.genre) && (
            <span className="chip">
              {track.sub_genre ?? track.genre}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
