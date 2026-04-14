"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Track } from "@/lib/sync";
import type { PoolTrack, EditReplacement } from "@/lib/compose";
import { PreviewPanel } from "@/components/preview-panel";
import { BottomPlayer } from "@/components/bottom-player";
import { Button, Checkbox, Textarea } from "@/components/ui";
import { useConfirm } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";

const EDIT_PERSIST_KEY = "curator-edit-state-v1";

interface BeatportPlaylistMeta {
  id: number;
  name: string;
  track_count: number;
}

interface PlaylistsResp {
  playlists: BeatportPlaylistMeta[];
}

interface PlaylistTracksResp {
  tracks: Track[];
}

function trackToPool(t: Track): PoolTrack {
  return {
    id: t.id,
    name: t.name,
    mix_name: t.mix_name ?? null,
    artists: (t.artists as string[]) ?? [],
    label: t.label ?? null,
    genre: t.genre ?? null,
    bpm: t.bpm ?? null,
    key_name: t.key_name ?? null,
    camelot: t.camelot ?? null,
    length_ms: t.length_ms ?? null,
    image_url: t.image_url ?? null,
    slug: t.slug ?? null,
    sample_url: t.sample_url ?? null,
    sample_start_ms: t.sample_start_ms ?? null,
    sample_end_ms: t.sample_end_ms ?? null,
  };
}

async function fetchPlaylists(): Promise<PlaylistsResp> {
  const r = await fetch("/api/playlists");
  if (!r.ok) throw new Error("failed to load playlists");
  return r.json();
}

async function fetchPlaylistTracks(id: number): Promise<PlaylistTracksResp> {
  const r = await fetch(`/api/playlists/${id}`);
  if (!r.ok) throw new Error("failed to load playlist");
  return r.json();
}

type RerollStep = "idle" | "strategy" | "search" | "compose" | "done";

interface RerollProgress {
  step: RerollStep;
  query_done: number;
  query_total: number;
  last_query?: string;
  pool_size?: number;
  picks?: number;
}

const IDLE_PROGRESS: RerollProgress = {
  step: "idle",
  query_done: 0,
  query_total: 0,
};

export default function EditPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(
    null
  );
  // Sticky name so UI keeps rendering while the playlists list refetches
  // after a save cycles the Beatport id.
  const [loadedPlaylistName, setLoadedPlaylistName] = useState<string>("");
  const [workingTracks, setWorkingTracks] = useState<PoolTrack[]>([]);

  // Reroll modal state — open when user clicks a row's ↻ icon.
  const [rerollModalIds, setRerollModalIds] = useState<number[] | null>(null);
  // Persisted across sessions so the user doesn't have to re-type the
  // brief or re-tick force-camelot every time they open the modal.
  const [rerollPrompt, setRerollPrompt] = useState("");
  const [forceCamelot, setForceCamelot] = useState(false);

  const [rerolling, setRerolling] = useState(false);
  const [progress, setProgress] = useState<RerollProgress>(IDLE_PROGRESS);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Preview state (shared with bottom player + details panel)
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [playingId, setPlayingId] = useState<number | null>(null);

  // ── Persistence (same pattern as /build) ──────────────────────────
  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(EDIT_PERSIST_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<{
        selectedPlaylistId: number | null;
        loadedPlaylistName: string;
        workingTracks: PoolTrack[];
        rerollPrompt: string;
        forceCamelot: boolean;
        dirty: boolean;
      }>;
      if (typeof saved.selectedPlaylistId === "number")
        setSelectedPlaylistId(saved.selectedPlaylistId);
      if (typeof saved.loadedPlaylistName === "string")
        setLoadedPlaylistName(saved.loadedPlaylistName);
      if (Array.isArray(saved.workingTracks))
        setWorkingTracks(saved.workingTracks);
      if (typeof saved.rerollPrompt === "string")
        setRerollPrompt(saved.rerollPrompt);
      if (typeof saved.forceCamelot === "boolean")
        setForceCamelot(saved.forceCamelot);
      if (typeof saved.dirty === "boolean") setDirty(saved.dirty);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    try {
      localStorage.setItem(
        EDIT_PERSIST_KEY,
        JSON.stringify({
          selectedPlaylistId,
          loadedPlaylistName,
          workingTracks,
          rerollPrompt,
          forceCamelot,
          dirty,
        })
      );
    } catch {
      /* ignore */
    }
  }, [
    selectedPlaylistId,
    loadedPlaylistName,
    workingTracks,
    rerollPrompt,
    forceCamelot,
    dirty,
  ]);

  // ── Playlists from Beatport ───────────────────────────────────────
  const { data: plData } = useQuery({
    queryKey: ["playlists"],
    queryFn: fetchPlaylists,
    staleTime: 60_000,
  });

  // Freshly load tracks when the user picks a playlist AND the working
  // copy hasn't already been hydrated from localStorage for this id.
  const { data: trData } = useQuery({
    queryKey: ["edit-playlist-tracks", selectedPlaylistId],
    queryFn: () => fetchPlaylistTracks(selectedPlaylistId!),
    enabled: selectedPlaylistId != null,
    staleTime: 60_000,
  });

  // Hydrate workingTracks when a playlist is first loaded. We only
  // populate when workingTracks is empty so react-query refetches
  // (window-focus, stale-time) can't clobber the user's in-progress
  // edits. onPickPlaylist explicitly clears workingTracks when the
  // user switches playlists so the next trData fires a fresh hydrate.
  useEffect(() => {
    if (!trData) return;
    if (workingTracks.length > 0) return;
    setWorkingTracks(trData.tracks.map(trackToPool));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trData]);

  // Keep loadedPlaylistName in sync with plData when available, but
  // don't clear it during the brief window after a save rotates the
  // Beatport id and we're waiting for the refetched list.
  useEffect(() => {
    if (selectedPlaylistId == null) return;
    const pl = plData?.playlists.find((p) => p.id === selectedPlaylistId);
    if (pl) setLoadedPlaylistName(pl.name);
  }, [plData, selectedPlaylistId]);

  const hasLoadedPlaylist = selectedPlaylistId != null && loadedPlaylistName !== "";

  // ── Track navigation for bottom player ────────────────────────────
  const currentTrackIndex =
    selectedTrackId == null
      ? -1
      : workingTracks.findIndex((t) => t.id === selectedTrackId);
  const prevTrackId =
    currentTrackIndex > 0 ? workingTracks[currentTrackIndex - 1].id : null;
  const nextTrackId =
    currentTrackIndex >= 0 && currentTrackIndex < workingTracks.length - 1
      ? workingTracks[currentTrackIndex + 1].id
      : null;
  const goNext = () => {
    if (nextTrackId != null) setSelectedTrackId(nextTrackId);
  };
  const goPrev = () => {
    if (prevTrackId != null) setSelectedTrackId(prevTrackId);
  };

  // ── Actions ───────────────────────────────────────────────────────
  const deleteTrack = async (id: number) => {
    const target = workingTracks.find((t) => t.id === id);
    const label = target
      ? `${target.artists.join(", ")} — ${target.name}`
      : "this track";
    const ok = await confirm({
      title: "Remove track",
      message: `Remove ${label} from the playlist?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    const next = workingTracks.filter((t) => t.id !== id);
    setWorkingTracks(next);
    setDirty(true);
    void autoSave(next.map((t) => t.id));
  };

  // Delete an ENTIRE Beatport playlist from the sidebar. Hits the
  // DELETE endpoint and invalidates the cached sidebar list.
  const deletePlaylistFromSidebar = async (id: number, name: string) => {
    const ok = await confirm({
      title: "Delete playlist",
      message: `Delete "${name}" from Beatport? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/playlists/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(
          typeof d.error === "string" ? d.error : "delete failed"
        );
      }
      if (selectedPlaylistId === id) {
        setSelectedPlaylistId(null);
        setLoadedPlaylistName("");
        setWorkingTracks([]);
        setDirty(false);
      }
      qc.invalidateQueries({ queryKey: ["playlists"] });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ── Drag-reorder within the full playlist ────────────────────────
  // Row transforms during drag create holes in DOM hit-testing — once a
  // row slides away from the cursor the cursor lands in empty space and
  // row-level dragover events stop firing. Solution: listen at the
  // container level and compute the target index from cursor Y vs the
  // live bounding rects of each row.
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const tracklistRef = useRef<HTMLDivElement>(null);

  const onRowDragStart = (idx: number) => () => {
    setDragIdx(idx);
    setHoverIdx(idx);
  };
  const onRowDragEnd = () => {
    setDragIdx(null);
    setHoverIdx(null);
  };

  // Compute the target (post-splice) index from the cursor Y position.
  // Uses visual bounding rects so transforms-in-flight are respected.
  const computeTargetFromCursor = (clientY: number): number | null => {
    if (dragIdx == null) return null;
    const container = tracklistRef.current;
    if (!container) return null;
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length === 0) return null;

    // Walk children top-to-bottom. If cursor is above row i's midpoint
    // (including rows above it), insert before row i. Otherwise insert
    // after the last row.
    let insertBefore = children.length; // default: after last row
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) {
        insertBefore = i;
        break;
      }
    }

    // `insertBefore` is a gap index in the ORIGINAL list (0..length).
    // After splicing out the source, we need to shift if the source
    // sits before the gap.
    const adjusted =
      insertBefore > dragIdx ? insertBefore - 1 : insertBefore;
    return Math.max(0, Math.min(workingTracks.length - 1, adjusted));
  };

  const onContainerDragOver = (e: React.DragEvent) => {
    if (dragIdx == null) return;
    e.preventDefault();
    const target = computeTargetFromCursor(e.clientY);
    if (target != null && target !== hoverIdx) setHoverIdx(target);
  };

  const onContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIdx;
    const target = computeTargetFromCursor(e.clientY);
    setDragIdx(null);
    setHoverIdx(null);
    if (from == null || target == null || from === target) return;
    const next = [...workingTracks];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    setWorkingTracks(next);
    setDirty(true);
    void autoSave(next.map((t) => t.id));
  };

  const rowOffsetFor = (idx: number): number => {
    if (dragIdx == null || hoverIdx == null) return 0;
    if (idx === dragIdx) return 0;
    if (dragIdx < hoverIdx) {
      if (idx > dragIdx && idx <= hoverIdx) return -100;
    } else if (dragIdx > hoverIdx) {
      if (idx >= hoverIdx && idx < dragIdx) return 100;
    }
    return 0;
  };

  // Per-row reroll — clicking the ↻ icon on a single row opens the
  // reroll modal with that one track queued up. User confirms (or
  // tweaks the prompt / toggles camelot) and the modal triggers run.
  const openRerollModal = (id: number) => {
    if (rerolling || saving) return;
    setRerollModalIds([id]);
  };

  const confirmReroll = () => {
    if (!rerollModalIds || rerolling) return;
    void runReroll(rerollModalIds);
  };

  const onPickPlaylist = (id: number) => {
    if (rerolling || saving) return;
    const pl = plData?.playlists.find((p) => p.id === id);
    setSelectedPlaylistId(id);
    setLoadedPlaylistName(pl?.name ?? "");
    setWorkingTracks([]);
    setDirty(false);
    setError(null);
    setSaveMsg(null);
  };

  const runReroll = async (rerollIds: number[]) => {
    if (rerolling || rerollIds.length === 0) return;
    setRerolling(true);
    setError(null);
    setSaveMsg(null);
    setProgress({ step: "strategy", query_done: 0, query_total: 0 });

    try {
      const r = await fetch("/api/edit/reroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlist_tracks: workingTracks,
          reroll_ids: rerollIds,
          user_prompt: rerollPrompt.trim() || undefined,
          force_camelot: forceCamelot,
        }),
      });
      if (!r.body) throw new Error("no body");
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let replacements: EditReplacement[] | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          if (!chunk.startsWith("data: ")) continue;
          const ev = JSON.parse(chunk.slice(6)) as Record<string, unknown>;
          const t = ev.type as string;
          setProgress((cur) => {
            const next = { ...cur };
            switch (t) {
              case "strategy_start":
                next.step = "strategy";
                break;
              case "strategy_done":
                next.step = "search";
                next.query_total = Number(ev.queries) || 0;
                next.query_done = 0;
                break;
              case "search_start":
                next.last_query = String(ev.query ?? "");
                break;
              case "search_done":
                next.query_done += 1;
                break;
              case "pool_ready":
                next.pool_size = Number(ev.size) || 0;
                next.step = "compose";
                break;
              case "compose_start":
                next.step = "compose";
                break;
              case "compose_done":
                next.picks = Number(ev.picks) || 0;
                next.step = "done";
                break;
            }
            return next;
          });
          if (t === "done") {
            const result = ev.result as {
              replacements: EditReplacement[];
            };
            replacements = result.replacements;
          } else if (t === "error") {
            throw new Error(String(ev.msg));
          }
        }
      }

      if (replacements && replacements.length > 0) {
        const byOldId = new Map(replacements.map((r) => [r.old_id, r]));
        const next: PoolTrack[] = workingTracks.map((t) => {
          const rep = byOldId.get(t.id);
          return rep ? rep.new_track : t;
        });
        setWorkingTracks(next);
        setDirty(true);
        setRerollModalIds(null);
        // Auto-sync to Beatport with the new track list.
        void autoSave(next.map((t) => t.id));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRerolling(false);
      setTimeout(() => setProgress(IDLE_PROGRESS), 1200);
    }
  };

  // Push the given track IDs to Beatport. The server delete+recreates
  // the playlist every time so the freshly-edited copy bubbles to the
  // top of the user's library — that means the Beatport id changes on
  // every save. We update selectedPlaylistId to the new id, pre-seed
  // the react-query cache for the new id with our workingTracks order
  // so the UI doesn't flicker, and invalidate the playlists list so
  // the sidebar reflects the new id in track-count order.
  const autoSave = async (trackIds: number[]) => {
    if (selectedPlaylistId == null || !loadedPlaylistName || saving) return;
    const originalId = selectedPlaylistId;
    setSaving(true);
    setError(null);
    setSaveMsg(null);
    try {
      const r = await fetch("/api/edit/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beatport_id: originalId,
          name: loadedPlaylistName,
          track_ids: trackIds,
        }),
      });
      const d = (await r.json()) as {
        ok: boolean;
        beatport_id?: number;
        error?: string;
      };
      if (!r.ok || !d.ok) {
        throw new Error(d.error ?? "save failed");
      }
      setDirty(false);
      setSaveMsg("synced to beatport");
      if (d.beatport_id && d.beatport_id !== originalId) {
        // Seed the cache for the new id with the exact order we sent so
        // the hydration effect (which only runs when workingTracks is
        // empty) has no chance to overwrite our state — but also so
        // any later refetch returns what we expect.
        qc.setQueryData(["edit-playlist-tracks", d.beatport_id], {
          tracks: workingTracks.map((t, i) => ({
            ...(t as unknown as Track),
            _position: i + 1,
          })),
        });
        setSelectedPlaylistId(d.beatport_id);
        // Refresh the sidebar so the new playlist id appears and the
        // old id is gone.
        qc.invalidateQueries({ queryKey: ["playlists"] });
      }
      setTimeout(
        () => setSaveMsg((m) => (m === "synced to beatport" ? null : m)),
        2500
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 grid grid-cols-[260px_1fr_auto] grid-rows-[minmax(0,1fr)] min-h-0">
      {/* LEFT: Playlist picker — header stays pinned, the playlist
          list fills the remaining vertical space and scrolls on its own
          so long lists reach the bottom of the viewport. */}
      <aside className="border-r border-[var(--border)] bg-[var(--bg)] flex flex-col min-h-0 overflow-hidden">
        <div className="p-4 border-b border-[var(--border-soft)] shrink-0">
          <div className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] uppercase">
            Edit Playlist
          </div>
          <p className="text-[12px] text-[var(--fg-dim)] mt-1 leading-relaxed">
            Pick a playlist, then use the ↻ icon on any track to reroll it
            with AI.
          </p>
        </div>
        <div className="px-4 pt-4 pb-1 shrink-0">
          <div className="text-xs font-mono tracking-wider text-[var(--fg-mute)] uppercase font-semibold">
            My Playlists
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4">
          <div className="space-y-0.5">
            {(plData?.playlists ?? []).map((pl) => (
              <div
                key={pl.id}
                className={cn(
                  "group flex items-center gap-1 rounded-sm text-xs transition-colors",
                  selectedPlaylistId === pl.id
                    ? "bg-[var(--bg-elev-2)]"
                    : "hover:bg-[var(--bg-elev)]"
                )}
              >
                <button
                  onClick={() => onPickPlaylist(pl.id)}
                  disabled={rerolling || saving}
                  className={cn(
                    "flex-1 min-w-0 flex items-center justify-between gap-2 px-2 py-1.5 cursor-pointer",
                    selectedPlaylistId === pl.id
                      ? "text-[var(--accent)] font-medium"
                      : "text-[var(--fg-dim)] hover:text-[var(--fg)]",
                    (rerolling || saving) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <span className="truncate text-left">{pl.name}</span>
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-mono",
                      selectedPlaylistId === pl.id
                        ? "text-[var(--accent)]"
                        : "text-[var(--fg-mute)]"
                    )}
                  >
                    {pl.track_count}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deletePlaylistFromSidebar(pl.id, pl.name)}
                  disabled={rerolling || saving}
                  title={`Delete "${pl.name}" from Beatport`}
                  className={cn(
                    "shrink-0 pr-2 text-[var(--fg-mute)] hover:text-[var(--danger)] cursor-pointer transition-colors",
                    (rerolling || saving) && "cursor-not-allowed"
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              </div>
            ))}
            {!plData && (
              <div className="text-[11px] font-mono text-[var(--fg-mute)] italic px-2 py-1">
                loading…
              </div>
            )}
          </div>
        </div>
        {error && (
          <div className="m-4 text-xs text-[var(--danger)] font-mono bg-[color-mix(in_srgb,var(--danger)_10%,var(--bg-elev))] border border-[var(--danger)] p-2 rounded-sm shrink-0">
            {error}
          </div>
        )}
      </aside>

      {/* CENTER: Tracklist + bottom player */}
      <div className="flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto min-h-0 min-w-0">
          {!hasLoadedPlaylist && (
            <div className="h-full flex items-center justify-center text-[var(--fg-mute)] text-sm text-center px-10">
              <div>
                <div className="font-mono text-xs uppercase tracking-wider mb-2">
                  No playlist loaded
                </div>
                <div>
                  Pick one of your Beatport playlists on the left to start
                  editing.
                </div>
              </div>
            </div>
          )}

          {hasLoadedPlaylist && workingTracks.length > 0 && (
            <div className="p-6 space-y-4">
              <div className="pb-4 border-b border-[var(--border-soft)] space-y-1">
                <div className="text-[11px] font-mono tracking-[0.2em] text-[var(--fg-mute)] uppercase">
                  Editing
                </div>
                <h2 className="text-xl font-bold text-[var(--fg)] leading-tight">
                  {loadedPlaylistName}
                </h2>
                <div className="flex items-baseline gap-3 pt-1">
                  <div className="font-mono text-xs text-[var(--fg-dim)]">
                    {workingTracks.length} tracks
                  </div>
                  {saving && (
                    <div className="text-[11px] font-mono text-[var(--accent)] animate-pulse">
                      syncing to beatport…
                    </div>
                  )}
                </div>
              </div>

              <div
                ref={tracklistRef}
                onDragOver={onContainerDragOver}
                onDrop={onContainerDrop}
                className="space-y-1"
              >
                {workingTracks.map((t, i) => (
                  <EditRow
                    key={`${t.id}-${i}`}
                    index={i + 1}
                    track={t}
                    playing={playingId === t.id}
                    active={selectedTrackId === t.id}
                    dragging={dragIdx === i}
                    rowOffsetPct={rowOffsetFor(i)}
                    onPreview={() => {
                      setSelectedTrackId(t.id);
                      setDetailsOpen(true);
                    }}
                    onDelete={() => deleteTrack(t.id)}
                    onReroll={() => openRerollModal(t.id)}
                    onDragStart={onRowDragStart(i)}
                    onDragEnd={onRowDragEnd}
                    disabled={rerolling}
                  />
                ))}
              </div>
            </div>
          )}

          {hasLoadedPlaylist && workingTracks.length === 0 && trData && (
            <div className="h-full flex items-center justify-center text-[var(--fg-mute)] text-sm">
              This playlist has no tracks.
            </div>
          )}

          {hasLoadedPlaylist && !trData && workingTracks.length === 0 && (
            <div className="h-full flex items-center justify-center text-[var(--fg-mute)] text-sm font-mono animate-pulse">
              loading tracks…
            </div>
          )}
        </div>

        <BottomPlayer
          trackId={selectedTrackId}
          nextTrackId={nextTrackId}
          onPlayingChange={(p) => setPlayingId(p ? selectedTrackId : null)}
          onEnded={goNext}
          onPrev={prevTrackId != null ? goPrev : null}
          onNext={nextTrackId != null ? goNext : null}
        />
      </div>

      {/* RIGHT: details */}
      {detailsOpen && selectedTrackId != null && (
        <PreviewPanel
          trackId={selectedTrackId}
          onClose={() => setDetailsOpen(false)}
        />
      )}

      {/* Reroll modal — opens when user clicks a row's ↻ icon */}
      {rerollModalIds && (
        <RerollModal
          targetTracks={workingTracks.filter((t) =>
            rerollModalIds.includes(t.id)
          )}
          prompt={rerollPrompt}
          onPromptChange={setRerollPrompt}
          forceCamelot={forceCamelot}
          onForceCamelotChange={setForceCamelot}
          rerolling={rerolling}
          progress={progress}
          onClose={() => {
            if (rerolling) return;
            setRerollModalIds(null);
          }}
          onConfirm={confirmReroll}
        />
      )}
    </div>
  );
}

// ── Reroll modal ──────────────────────────────────────────────────────
// Shown when the user clicks the ↻ icon on a row. Houses the optional
// prompt textarea and the force-camelot toggle, plus a confirm button
// that kicks off runReroll. During the reroll the form is hidden and
// the progress bar takes over.

function RerollModal({
  targetTracks,
  prompt,
  onPromptChange,
  forceCamelot,
  onForceCamelotChange,
  rerolling,
  progress,
  onClose,
  onConfirm,
}: {
  targetTracks: PoolTrack[];
  prompt: string;
  onPromptChange: (v: string) => void;
  forceCamelot: boolean;
  onForceCamelotChange: (v: boolean) => void;
  rerolling: boolean;
  progress: RerollProgress;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const target = targetTracks[0];
  return (
    <div
      className="fixed left-0 right-0 top-14 bottom-28 z-50 flex items-start justify-center bg-black/70 p-6 pt-10"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-elev)] border border-[var(--border)] rounded-sm w-[560px] max-w-full max-h-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div>
            <div className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] uppercase">
              Reroll Track
            </div>
            <div className="text-sm text-[var(--fg)] truncate max-w-[440px]">
              {target ? (
                <>
                  {target.artists.join(", ")}{" "}
                  <span className="text-[var(--fg-mute)]">— {target.name}</span>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={rerolling}
            className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] hover:text-[var(--fg)] cursor-pointer disabled:opacity-40"
          >
            CLOSE
          </button>
        </div>

        {rerolling ? (
          <div className="p-6">
            <RerollProgressBox progress={progress} />
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <div>
              <div className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] uppercase mb-1">
                Reroll Prompt{" "}
                <span className="text-[var(--fg-mute)] normal-case">
                  (optional)
                </span>
              </div>
              <Textarea
                placeholder="leave empty to let AI analyze the playlist and pick in the same vibe — or steer it: 'darker, more acid', 'deeper groove', 'less commercial'"
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                rows={5}
                className="font-mono text-[12px]"
              />
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                checked={forceCamelot}
                onChange={onForceCamelotChange}
                label="Force Camelot chain"
              />
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-soft)]">
              <Button
                variant="ghost"
                size="md"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={onConfirm}
                className="flex-1"
              >
                Reroll
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Track row ──────────────────────────────────────────────────────────

function EditRow({
  index,
  track,
  playing,
  active,
  dragging,
  rowOffsetPct = 0,
  onPreview,
  onDelete,
  onReroll,
  onDragStart,
  onDragEnd,
  disabled,
}: {
  index: number;
  track: PoolTrack;
  playing: boolean;
  active: boolean;
  dragging: boolean;
  rowOffsetPct?: number;
  onPreview: () => void;
  onDelete: () => void;
  onReroll: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  disabled: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  // See components/track-row.tsx for the rationale — set the whole row
  // as the browser drag image so the user sees a translucent card under
  // the cursor instead of just the hamburger handle.
  const handleDragStart = (e: React.DragEvent) => {
    if (rowRef.current && e.dataTransfer) {
      e.dataTransfer.setDragImage(rowRef.current, 20, 24);
      e.dataTransfer.effectAllowed = "move";
    }
    onDragStart();
  };

  return (
    <div
      ref={rowRef}
      style={{
        transform: rowOffsetPct
          ? `translate3d(0, ${rowOffsetPct}%, 0)`
          : undefined,
        transition:
          "transform 200ms cubic-bezier(0.2, 0, 0, 1), opacity 150ms, border-color 150ms, background-color 150ms, box-shadow 150ms",
      }}
      className={cn(
        "group flex items-center gap-2 px-2 py-1.5 rounded-sm border will-change-transform",
        dragging
          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_18%,var(--bg-elev-2))] opacity-80 shadow-[0_0_0_1px_var(--accent),0_10px_24px_-8px_rgba(0,0,0,0.6)]"
          : active
            ? "border-[var(--accent-2)] bg-[var(--bg-elev-2)]"
            : "border-[var(--border-soft)] bg-[var(--bg-elev)] hover:border-[var(--border)]"
      )}
    >
      {/* Drag handle — hamburger icon */}
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        title="Drag to reorder"
        className={cn(
          "shrink-0 text-[var(--fg-mute)] hover:text-[var(--fg)] transition-colors cursor-grab active:cursor-grabbing px-0.5",
          disabled && "opacity-40 cursor-not-allowed"
        )}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <rect x="4" y="6" width="16" height="1.5" rx="0.5" />
          <rect x="4" y="11.25" width="16" height="1.5" rx="0.5" />
          <rect x="4" y="16.5" width="16" height="1.5" rx="0.5" />
        </svg>
      </div>

      <div className="shrink-0 w-7 font-mono text-[11px] text-[var(--fg-mute)] tabular-nums text-right">
        {index}
      </div>

      {/* Album art — clicking triggers preview so the track starts
          playing in the bottom player. Overlay shows a play icon on
          row hover (and stays visible while the track is playing). */}
      <button
        type="button"
        onClick={onPreview}
        disabled={!track.sample_url}
        aria-label={playing ? "Pause preview" : "Play preview"}
        className="relative h-10 w-10 shrink-0 rounded-sm bg-[var(--border-soft)] bg-cover bg-center overflow-hidden cursor-pointer"
        style={
          track.image_url
            ? { backgroundImage: `url(${track.image_url})` }
            : undefined
        }
      >
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity",
            playing
              ? "bg-black/50 opacity-100"
              : "bg-black/40 opacity-0 group-hover:opacity-100 hover:bg-black/60",
            !track.sample_url && "!opacity-0 cursor-not-allowed"
          )}
        >
          {playing ? (
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-white drop-shadow"
              fill="currentColor"
            >
              <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-white drop-shadow"
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </span>
      </button>

      <button
        type="button"
        onClick={onPreview}
        className="flex-1 min-w-0 text-left cursor-pointer"
      >
        <div className="text-[11px] text-[var(--fg-dim)] truncate">
          {track.artists.join(", ") || "—"}
        </div>
        <div
          className={cn(
            "text-sm truncate font-medium",
            active ? "text-[var(--accent-2)]" : "text-[var(--fg)]"
          )}
        >
          {track.name}
          {track.mix_name && track.mix_name !== "Original Mix" && (
            <span className="text-[var(--fg-mute)]"> ({track.mix_name})</span>
          )}
        </div>
      </button>

      <div className="flex items-center gap-1.5 shrink-0">
        {track.bpm && (
          <span className="chip font-mono text-[10px]">{track.bpm}</span>
        )}
        {track.camelot && (
          <span className="chip chip-accent-2 font-mono text-[10px]">
            {track.camelot}
          </span>
        )}
        {playing && (
          <span className="text-[10px] font-mono text-[var(--accent)] uppercase tracking-wider animate-pulse">
            ▶
          </span>
        )}
      </div>

      {/* Reroll this track */}
      <button
        type="button"
        onClick={onReroll}
        disabled={disabled}
        title="Reroll this track"
        className={cn(
          "shrink-0 text-[var(--fg-mute)] hover:text-[var(--accent)] transition-colors p-1 cursor-pointer",
          disabled && "opacity-40 cursor-not-allowed"
        )}
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

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        title="Remove from playlist"
        className={cn(
          "shrink-0 text-[var(--fg-mute)] hover:text-[var(--danger)] transition-colors p-1 cursor-pointer",
          disabled && "opacity-40 cursor-not-allowed"
        )}
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
    </div>
  );
}

// ── Reroll progress ────────────────────────────────────────────────────

function RerollProgressBox({ progress }: { progress: RerollProgress }) {
  const label =
    progress.step === "strategy"
      ? "Analyzing playlist + brief…"
      : progress.step === "search"
        ? "Searching Beatport…"
        : progress.step === "compose"
          ? "Picking replacements…"
          : progress.step === "done"
            ? "Done."
            : "";
  const pct =
    progress.step === "strategy"
      ? 10
      : progress.step === "search"
        ? 15 +
          (progress.query_total > 0
            ? 50 * (progress.query_done / progress.query_total)
            : 0)
        : progress.step === "compose"
          ? 85
          : progress.step === "done"
            ? 100
            : 0;

  return (
    <div className="border-t border-[var(--border-soft)] pt-3 space-y-2">
      <div className="text-[11px] font-mono text-[var(--accent)] animate-pulse">
        {label}
      </div>
      {progress.last_query && progress.step === "search" && (
        <div className="text-[10px] font-mono text-[var(--fg-mute)] truncate">
          → "{progress.last_query}"
        </div>
      )}
      {progress.pool_size != null && (
        <div className="text-[10px] font-mono text-[var(--fg-mute)]">
          pool: {progress.pool_size} candidates
        </div>
      )}
      <div className="h-1 bg-[var(--border)] rounded-sm overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
