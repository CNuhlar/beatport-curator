"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

export interface TimelineSectionView {
  id: string;
  duration_min: number;
  prompt: string;
}

export interface TimelineEditorProps {
  sections: TimelineSectionView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onResize: (leftId: string, rightId: string, leftMin: number, rightMin: number) => void;
}

const MIN_SECTION_MIN = 3;

/**
 * Horizontal waveform-style bar representing the full set, divided
 * into sections proportional to their duration. Click to select.
 * Drag the boundary between two sections to reallocate minutes
 * between them (total stays constant).
 */
export function TimelineEditor({
  sections,
  selectedId,
  onSelect,
  onResize,
}: TimelineEditorProps) {
  const total = sections.reduce((a, s) => a + s.duration_min, 0);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDragStart = (e: React.PointerEvent, leftIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const minutesPerPx = total / rect.width;
    const startX = e.clientX;
    const left = sections[leftIdx];
    const right = sections[leftIdx + 1];
    if (!right) return;
    const startLeftMin = left.duration_min;
    const startRightMin = right.duration_min;
    const sumPair = startLeftMin + startRightMin;

    const onMove = (ev: PointerEvent) => {
      const deltaPx = ev.clientX - startX;
      const deltaMin = Math.round(deltaPx * minutesPerPx);
      let newLeft = startLeftMin + deltaMin;
      let newRight = startRightMin - deltaMin;
      if (newLeft < MIN_SECTION_MIN) {
        newLeft = MIN_SECTION_MIN;
        newRight = sumPair - MIN_SECTION_MIN;
      }
      if (newRight < MIN_SECTION_MIN) {
        newRight = MIN_SECTION_MIN;
        newLeft = sumPair - MIN_SECTION_MIN;
      }
      if (newLeft !== left.duration_min || newRight !== right.duration_min) {
        onResize(left.id, right.id, newLeft, newRight);
      }
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-[11px] font-mono text-[var(--fg-mute)] uppercase tracking-wider">
        <span>Timeline · drag boundaries to resize</span>
        <span>
          {total} min · {sections.length} section
          {sections.length === 1 ? "" : "s"}
        </span>
      </div>
      <div
        ref={containerRef}
        className="relative flex h-14 rounded-sm overflow-hidden border border-[var(--border)] bg-[var(--bg-elev-2)]"
      >
        {sections.map((s, i) => {
          const pct = total > 0 ? (s.duration_min / total) * 100 : 0;
          const active = selectedId === s.id;
          return (
            <div
              key={s.id}
              className="relative flex"
              style={{ width: `${pct}%` }}
            >
              <button
                onClick={() => onSelect(s.id)}
                className={cn(
                  "relative group transition-colors cursor-pointer overflow-hidden flex-1 border-l first:border-l-0 border-[var(--border)]",
                  active
                    ? "bg-[color-mix(in_srgb,var(--accent)_20%,var(--bg-elev))]"
                    : "hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-elev))]"
                )}
              >
                {/* fake waveform bars */}
                <div className="absolute inset-0 flex items-center justify-around px-1 opacity-60">
                  {Array.from({ length: Math.max(8, Math.floor(pct / 2)) }).map(
                    (_, j) => {
                      const seed = (s.id.charCodeAt(0) + j * 17) % 100;
                      const h = 20 + (seed % 60);
                      return (
                        <span
                          key={j}
                          className={cn(
                            "inline-block w-[2px] rounded-sm",
                            active
                              ? "bg-[var(--accent)]"
                              : "bg-[var(--fg-mute)] group-hover:bg-[var(--accent)]"
                          )}
                          style={{ height: `${h}%` }}
                        />
                      );
                    }
                  )}
                </div>

                {/* section label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span
                    className={cn(
                      "font-mono text-[11px] leading-none",
                      active ? "text-[var(--accent)]" : "text-[var(--fg)]"
                    )}
                  >
                    {s.duration_min}m
                  </span>
                  <span className="font-mono text-[10px] text-[var(--fg-mute)] leading-none mt-0.5">
                    {i + 1}
                  </span>
                </div>
              </button>

              {/* drag handle (between sections) */}
              {i < sections.length - 1 && (
                <div
                  onPointerDown={(e) => onDragStart(e, i)}
                  className="absolute right-0 top-0 bottom-0 w-2 -mr-1 cursor-ew-resize z-10 group/handle"
                  style={{ touchAction: "none" }}
                >
                  <div className="h-full w-[2px] mx-auto bg-[var(--border)] group-hover/handle:bg-[var(--accent)] transition-colors" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
