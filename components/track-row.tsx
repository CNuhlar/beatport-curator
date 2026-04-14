"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { PoolTrack } from "@/lib/compose";

export interface TrackRowProps {
  index: number;
  track: PoolTrack;
  why: string;
  transition_note: string;
  selected: boolean;
  playing: boolean;
  onSelect: () => void;
  onPlayToggle: () => void;
  onReplace?: () => void;
  onDelete?: () => void;
  /** HTML5 drag-and-drop handlers for within-section reorder. When the
   *  parent passes these, a grip (hamburger) handle appears on the left. */
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  /** True when THIS row is the one being dragged — shown as a ghost. */
  dragging?: boolean;
  /** Percentage translate-Y for the slide animation when another row is
   *  being dragged across this one. Positive moves down, negative moves
   *  up. Zero when no drag is happening. */
  rowOffsetPct?: number;
}

export function TrackRow({
  index,
  track,
  why,
  transition_note,
  selected,
  playing,
  onSelect,
  onPlayToggle,
  onReplace,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  dragging,
  rowOffsetPct = 0,
}: TrackRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  // HTML5 DnD paints the drag initiator element as the ghost preview by
  // default — but the initiator is the tiny hamburger handle, so the
  // user gets a 16px square following their cursor instead of a card.
  // Override with setDragImage pointing at the whole row so they see
  // the card they're carrying at 80% opacity.
  const handleDragStart = (e: React.DragEvent) => {
    if (rowRef.current && e.dataTransfer) {
      // Offset so the cursor lands near the middle-left of the card
      e.dataTransfer.setDragImage(rowRef.current, 20, 32);
      e.dataTransfer.effectAllowed = "move";
    }
    onDragStart?.(e);
  };
  const artists = track.artists.join(", ");
  const mix =
    track.mix_name && track.mix_name !== "Original Mix"
      ? ` (${track.mix_name})`
      : "";

  return (
    <div
      ref={rowRef}
      onClick={onSelect}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        transform: rowOffsetPct ? `translate3d(0, ${rowOffsetPct}%, 0)` : undefined,
        transition: "transform 200ms cubic-bezier(0.2, 0, 0, 1), opacity 150ms, border-color 150ms, background-color 150ms, box-shadow 150ms",
      }}
      className={cn(
        "group border rounded-sm p-2 pr-3 flex items-stretch gap-3 cursor-pointer will-change-transform",
        dragging
          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_18%,var(--bg-elev-2))] opacity-80 shadow-[0_0_0_1px_var(--accent),0_10px_24px_-8px_rgba(0,0,0,0.6)]"
          : selected
            ? "border-[var(--accent)] bg-[var(--bg-elev)]"
            : "border-[var(--border-soft)] bg-[var(--bg-elev)] hover:bg-[var(--bg-elev-2)] hover:border-[var(--border)]"
      )}
    >
      {/* Drag handle (hamburger) — only rendered when reorder is enabled */}
      {onDragStart && (
        <div
          draggable
          onDragStart={handleDragStart}
          onDragEnd={onDragEnd}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder within this section"
          className="self-center text-[var(--fg-mute)] hover:text-[var(--fg)] transition-colors cursor-grab active:cursor-grabbing px-0.5"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <rect x="4" y="6" width="16" height="1.5" rx="0.5" />
            <rect x="4" y="11.25" width="16" height="1.5" rx="0.5" />
            <rect x="4" y="16.5" width="16" height="1.5" rx="0.5" />
          </svg>
        </div>
      )}

      {/* Album art with play overlay */}
      <div
        className="relative h-16 w-16 shrink-0 bg-[var(--border-soft)] rounded-sm overflow-hidden"
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
            <PauseIcon className="h-6 w-6 text-white drop-shadow" />
          ) : (
            <PlayIcon className="h-6 w-6 text-white drop-shadow" />
          )}
        </button>
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] text-[var(--fg-mute)] shrink-0">
              {String(index).padStart(2, "0")}
            </span>
            <span className="text-xs text-[var(--fg-dim)] truncate">
              {artists}
            </span>
          </div>
          <div className="text-sm text-[var(--fg)] truncate mt-0.5">
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
          {track.genre && <span className="chip">{track.genre}</span>}
        </div>
      </div>

      {/* Why + transition — wraps so long text stays readable */}
      <div className="hidden lg:flex flex-col justify-center gap-1 w-[260px] shrink-0 text-right">
        <div
          className="text-[11px] font-mono text-[var(--fg-mute)] italic leading-snug whitespace-normal break-words"
          title={why}
        >
          {why}
        </div>
        <div className="text-[11px] font-mono text-[var(--accent-2)] leading-snug whitespace-normal break-words">
          → {transition_note}
        </div>
      </div>

      {/* Action icons — reroll + delete */}
      <div className="self-center flex items-center gap-0.5">
        {onReplace && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReplace();
            }}
            title="Replace this track"
            className="text-[var(--fg-mute)] hover:text-[var(--accent)] transition-colors p-1 cursor-pointer"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Remove from playlist"
            className="text-[var(--fg-mute)] hover:text-[var(--danger)] transition-colors p-1 cursor-pointer"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
    </svg>
  );
}
