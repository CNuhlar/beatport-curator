"use client";

import { useState, useMemo, useRef, useEffect } from "react";

const BUILD_PERSIST_KEY = "curator-build-state-v1";
import { nanoid } from "nanoid";
import type { Strategy, PhaseStrategy } from "@/lib/claude";
import type { BuiltPick, PoolTrack } from "@/lib/compose";
import { Button, Checkbox, Input, Textarea, Card } from "@/components/ui";
import { TrackRow } from "@/components/track-row";
import { PreviewPanel } from "@/components/preview-panel";
import { BottomPlayer } from "@/components/bottom-player";
import { useConfirm } from "@/components/confirm-dialog";
import {
  TimelineEditor,
  type TimelineSectionView,
} from "@/components/timeline-editor";
import { formatMin, cn } from "@/lib/utils";
import { describeTransition } from "@/lib/camelot";
import { pickRandomPromptSet, randomPoeticName } from "@/lib/prompt-sets";

interface BuiltPhaseResp {
  phase: PhaseStrategy;
  tracks: BuiltPick[];
}

interface BuildResultResp {
  strategy: Strategy;
  phases: BuiltPhaseResp[];
  pool_size: number;
  playlist_name: string;
  beatport_id: number | null;
  beatport_error: string | null;
}

type StepState = "pending" | "active" | "done";

interface BuildStatus {
  steps: {
    strategy: StepState;
    search: StepState;
    compose: StepState;
    save: StepState;
  };
  strategy?: { phases: number; queries: number };
  search?: { done: number; total: number; lastQuery?: string };
  pool_size?: number;
  picks?: number;
  save_name?: string;
  beatport_id?: number | null;
  beatport_error?: string | null;
}

const INITIAL_BUILD_STATUS: BuildStatus = {
  steps: {
    strategy: "pending",
    search: "pending",
    compose: "pending",
    save: "pending",
  },
};

function calcProgress(s: BuildStatus): number {
  if (s.steps.save === "done") return 100;
  if (s.steps.save === "active") return 92;
  if (s.steps.compose === "done") return 88;
  if (s.steps.compose === "active") return 70;
  if (s.steps.search === "done") return 65;
  if (s.steps.search === "active" && s.search) {
    const ratio = s.search.done / Math.max(1, s.search.total);
    return 15 + 50 * ratio;
  }
  if (s.steps.strategy === "done") return 15;
  if (s.steps.strategy === "active") return 5;
  return 0;
}

async function streamBuild(
  body: {
    sections: Array<{ duration_min: number; prompt: string }>;
    name?: string;
    force_camelot?: boolean;
  },
  onEvent: (ev: Record<string, unknown>) => void
): Promise<void> {
  const r = await fetch("/api/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.body) throw new Error("no response body");
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      if (chunk.startsWith("data: ")) {
        try {
          onEvent(JSON.parse(chunk.slice(6)));
        } catch (e) {
          console.error("bad SSE chunk", chunk, e);
        }
      }
    }
  }
}

const PLACEHOLDERS = [
  "deep and hypnotic opener, minimal dub techno vibes, 120-124 bpm",
  "build tension with acid stabs and rolling percs, 128-132 bpm",
  "peak time euphoric techno, big room energy, 134-138 bpm",
  "warm melodic close, emotional and soft landing, 118-124 bpm",
];

function makeSection(
  duration: number,
  prompt = ""
): TimelineSectionView {
  return { id: nanoid(6), duration_min: duration, prompt };
}

export default function BuildPage() {
  const confirm = useConfirm();
  const [sections, setSections] = useState<TimelineSectionView[]>(() => [
    makeSection(15, ""),
    makeSection(30, ""),
    makeSection(15, ""),
  ]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    sections[0].id
  );
  const [saveName, setSaveName] = useState("");
  const [forceCamelot, setForceCamelot] = useState(false);
  const [result, setResult] = useState<BuildResultResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState<BuildStatus>(
    INITIAL_BUILD_STATUS
  );

  // Preview state
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [playingId, setPlayingId] = useState<number | null>(null);

  // Restore persisted build state on mount. Save on meaningful changes
  // so a page refresh (or nav-back) brings you right back to the last
  // build: sections + prompts, set name, force-camelot flag, generated
  // playlist.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(BUILD_PERSIST_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<{
        sections: TimelineSectionView[];
        saveName: string;
        forceCamelot: boolean;
        result: BuildResultResp | null;
      }>;
      if (saved.sections && saved.sections.length > 0) {
        setSections(saved.sections);
        setSelectedSectionId(saved.sections[0].id);
      }
      if (typeof saved.saveName === "string") setSaveName(saved.saveName);
      if (typeof saved.forceCamelot === "boolean")
        setForceCamelot(saved.forceCamelot);
      if (saved.result) setResult(saved.result);
    } catch {
      /* bad localStorage — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change — excludes transient state (error, building, preview).
  //
  // The first save-effect pass after mount is SKIPPED: on the same commit
  // the load effect runs setState(loaded) but this save effect still has
  // the default values in its closure, so without the skip it would write
  // defaults to localStorage and clobber the just-loaded data. React then
  // re-renders with loaded state, save re-runs (not the first time now),
  // and writes the correct values.
  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    try {
      localStorage.setItem(
        BUILD_PERSIST_KEY,
        JSON.stringify({ sections, saveName, forceCamelot, result })
      );
    } catch {
      /* quota or serialization error — ignore */
    }
  }, [sections, saveName, forceCamelot, result]);

  const totalDuration = useMemo(
    () => sections.reduce((a, s) => a + s.duration_min, 0),
    [sections]
  );

  const onBuild = async () => {
    const cleaned = sections
      .map((s) => ({
        duration_min: s.duration_min,
        prompt: s.prompt.trim(),
      }))
      .filter((s) => s.prompt.length >= 3 && s.duration_min >= 3);
    if (cleaned.length === 0) return;

    setBuilding(true);
    setError(null);
    setResult(null);
    setSelectedTrackId(null);
    setPlayingId(null);
    setBuildStatus(INITIAL_BUILD_STATUS);

    try {
      await streamBuild(
        {
          sections: cleaned,
          name: saveName.trim() || undefined,
          force_camelot: forceCamelot,
        },
        (ev) => {
          const t = ev.type as string;
          setBuildStatus((s) => {
            const next: BuildStatus = {
              ...s,
              steps: { ...s.steps },
              search: s.search ? { ...s.search } : undefined,
            };
            switch (t) {
              case "strategy_start":
                next.steps.strategy = "active";
                break;
              case "strategy_done":
                next.steps.strategy = "done";
                next.steps.search = "active";
                next.strategy = {
                  phases: Number(ev.phases),
                  queries: Number(ev.queries),
                };
                next.search = {
                  done: 0,
                  total: Number(ev.queries),
                };
                break;
              case "search_start":
                if (next.search) next.search.lastQuery = String(ev.query);
                break;
              case "search_done":
                if (next.search) next.search.done += 1;
                break;
              case "pool_ready":
                next.steps.search = "done";
                next.steps.compose = "active";
                next.pool_size = Number(ev.size);
                break;
              case "compose_start":
                next.steps.compose = "active";
                break;
              case "compose_done":
                next.steps.compose = "done";
                next.steps.save = "active";
                next.picks = Number(ev.picks);
                break;
              case "saved":
                next.save_name = String(ev.name);
                break;
              case "beatport_done":
                next.steps.save = "done";
                next.beatport_id = (ev.beatport_id as number | null) ?? null;
                next.beatport_error =
                  (ev.beatport_error as string | null) ?? null;
                break;
            }
            return next;
          });

          if (t === "done") setResult(ev.result as BuildResultResp);
          else if (t === "error") setError(String(ev.msg));
        }
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuilding(false);
    }
  };

  // Section editing helpers
  const updateSection = (id: string, patch: Partial<TimelineSectionView>) =>
    setSections((ss) =>
      ss.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  const removeSection = (id: string) => {
    setSections((ss) => {
      const next = ss.filter((s) => s.id !== id);
      if (next.length === 0) return [makeSection(30, "")];
      return next;
    });
    setSelectedSectionId((cur) => {
      if (cur !== id) return cur;
      const remaining = sections.filter((s) => s.id !== id);
      return remaining[0]?.id ?? "";
    });
  };
  const addSection = () => {
    const s = makeSection(15, "");
    setSections((ss) => [...ss, s]);
    setSelectedSectionId(s.id);
  };

  // Replace all sections with a random coherent prompt set + fresh name.
  const [lastRandomId, setLastRandomId] = useState<string | undefined>(undefined);
  const randomize = () => {
    const set = pickRandomPromptSet(lastRandomId);
    setLastRandomId(set.id);
    const newSections = set.sections.map((s) =>
      makeSection(s.duration_min, s.prompt)
    );
    setSections(newSections);
    setSelectedSectionId(newSections[0].id);
    setSaveName(randomPoeticName());
  };

  // Flatten picks for preview lookup
  const flatPicks: Array<{
    pick: BuiltPick;
    phase: PhaseStrategy;
    index: number;
  }> = [];
  let globalIdx = 0;
  for (const p of result?.phases ?? []) {
    for (const pick of p.tracks) {
      globalIdx++;
      flatPicks.push({ pick, phase: p.phase, index: globalIdx });
    }
  }
  const selectedTrack = flatPicks.find(
    (f) => f.pick.track.id === selectedTrackId
  );

  const onSelectTrack = (id: number) => {
    setSelectedTrackId(id);
    setDetailsOpen(true);
  };

  // Playlist navigation — compute prev/next from flat picks list.
  const currentTrackIndex =
    selectedTrackId == null
      ? -1
      : flatPicks.findIndex((f) => f.pick.track.id === selectedTrackId);
  const prevPickTrackId =
    currentTrackIndex > 0 ? flatPicks[currentTrackIndex - 1].pick.track.id : null;
  const nextPickTrackId =
    currentTrackIndex >= 0 && currentTrackIndex < flatPicks.length - 1
      ? flatPicks[currentTrackIndex + 1].pick.track.id
      : null;
  const advanceToNextTrack = () => {
    if (nextPickTrackId != null) setSelectedTrackId(nextPickTrackId);
  };
  const goToPrevTrack = () => {
    if (prevPickTrackId != null) setSelectedTrackId(prevPickTrackId);
  };

  // ── Replace single track ────────────────────────────────────────────
  const [replaceTarget, setReplaceTarget] = useState<{
    sectionIdx: number;
    trackId: number;
  } | null>(null);
  const [replaceLoading, setReplaceLoading] = useState(false);
  const [replaceCandidates, setReplaceCandidates] = useState<PoolTrack[]>([]);

  const openReplaceModal = async (sectionIdx: number, trackId: number) => {
    if (!result) return;
    setReplaceTarget({ sectionIdx, trackId });
    setReplaceLoading(true);
    setReplaceCandidates([]);
    try {
      const allUsedIds = result.phases.flatMap((p) =>
        p.tracks.map((pt) => pt.track.id)
      );
      const r = await fetch("/api/replace-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: {
            duration_min: sections[sectionIdx].duration_min,
            prompt: sections[sectionIdx].prompt.trim(),
          },
          exclude_ids: allUsedIds,
          limit: 8,
        }),
      });
      const d = await r.json();
      if (!r.ok)
        throw new Error(typeof d.error === "string" ? d.error : "fetch failed");
      setReplaceCandidates(d.candidates);
    } catch (e) {
      setError((e as Error).message);
      setReplaceTarget(null);
    } finally {
      setReplaceLoading(false);
    }
  };

  // Push the given phases to Beatport. We send beatport_id + name +
  // track_ids directly — the server has no local state to look up
  // anymore. On success we update result.beatport_id in case the sync
  // cycled the playlist id (always happens now, since sync delete+
  // recreates to bubble the playlist to the top of the library).
  const syncBeatport = async (phases: BuildResultResp["phases"]) => {
    const current = result;
    if (!current) return;
    const trackIds = phases.flatMap((p) => p.tracks.map((pt) => pt.track.id));
    if (trackIds.length === 0) return;
    try {
      const r = await fetch("/api/build/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beatport_id: current.beatport_id,
          name: current.playlist_name,
          track_ids: trackIds,
        }),
      });
      const d = (await r.json()) as {
        ok: boolean;
        beatport_id: number | null;
        error?: string;
      };
      if (!r.ok || !d.ok) return;
      setResult((cur) =>
        cur
          ? {
              ...cur,
              beatport_id: d.beatport_id,
              beatport_error: null,
            }
          : cur
      );
    } catch {
      /* fire-and-forget */
    }
  };

  const confirmReplace = (newTrack: PoolTrack) => {
    if (!result || !replaceTarget) return;
    const { sectionIdx, trackId } = replaceTarget;
    const nextPhases = result.phases.map((p, i) => {
      if (i !== sectionIdx) return p;
      const newTracks = p.tracks.map((pt, idx) => {
        if (pt.track.id !== trackId) return pt;
        // Recompute transition_note based on new track and its predecessor
        const prevPick = idx > 0 ? p.tracks[idx - 1] : null;
        const prevPhasePicks = i > 0 ? result.phases[i - 1].tracks : [];
        const prevTrack =
          prevPick?.track ??
          (prevPhasePicks.length > 0
            ? prevPhasePicks[prevPhasePicks.length - 1].track
            : null);
        const transition = prevTrack
          ? describeTransition(
              prevTrack.camelot,
              newTrack.camelot,
              prevTrack.bpm,
              newTrack.bpm
            )
          : "opener";
        return {
          track: newTrack,
          why: "manual replacement",
          transition_note: transition,
        };
      });
      return { ...p, tracks: newTracks };
    });
    setResult({ ...result, phases: nextPhases });
    setReplaceTarget(null);
    setReplaceCandidates([]);
    void syncBeatport(nextPhases);
  };

  // ── Delete a single track ─────────────────────────────────────────
  const deleteTrack = async (sectionIdx: number, trackId: number) => {
    if (!result) return;
    const target = result.phases[sectionIdx]?.tracks.find(
      (pt) => pt.track.id === trackId
    );
    const label = target
      ? `${target.track.artists.join(", ")} — ${target.track.name}`
      : "this track";
    const ok = await confirm({
      title: "Remove track",
      message: `Remove ${label} from the playlist?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    const nextPhases = result.phases.map((p, i) => {
      if (i !== sectionIdx) return p;
      return {
        ...p,
        tracks: p.tracks.filter((pt) => pt.track.id !== trackId),
      };
    });
    setResult({ ...result, phases: nextPhases });
    void syncBeatport(nextPhases);
  };

  // ── Drag-reorder within a single section ─────────────────────────
  // Row-level dragover hits a "hit-test hole" once rows start sliding
  // via transforms — the cursor lands over transformed elements or
  // empty space and events stop firing. Listen at the section-container
  // level instead and compute the target index live from the cursor Y
  // vs each row's visual bounding rect. Each section gets its own ref
  // via a ref map keyed by section index.
  const [dragInfo, setDragInfo] = useState<{
    sectionIdx: number;
    trackIdx: number;
  } | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const sectionRefs = useRef(new Map<number, HTMLDivElement | null>());
  const setSectionRef = (idx: number) => (el: HTMLDivElement | null) => {
    sectionRefs.current.set(idx, el);
  };

  const onRowDragStart = (sectionIdx: number, trackIdx: number) => {
    setDragInfo({ sectionIdx, trackIdx });
    setHoverIdx(trackIdx);
  };

  const onRowDragEnd = () => {
    setDragInfo(null);
    setHoverIdx(null);
  };

  const computeTargetFromCursor = (
    sectionIdx: number,
    clientY: number
  ): number | null => {
    if (!dragInfo || dragInfo.sectionIdx !== sectionIdx) return null;
    const container = sectionRefs.current.get(sectionIdx);
    if (!container) return null;
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length === 0) return null;
    let insertBefore = children.length;
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) {
        insertBefore = i;
        break;
      }
    }
    const adjusted =
      insertBefore > dragInfo.trackIdx ? insertBefore - 1 : insertBefore;
    const sectionLen = result?.phases[sectionIdx]?.tracks.length ?? 0;
    return Math.max(0, Math.min(sectionLen - 1, adjusted));
  };

  const onSectionDragOver =
    (sectionIdx: number) => (e: React.DragEvent) => {
      if (!dragInfo || dragInfo.sectionIdx !== sectionIdx) return;
      e.preventDefault();
      const target = computeTargetFromCursor(sectionIdx, e.clientY);
      if (target != null && target !== hoverIdx) setHoverIdx(target);
    };

  const onSectionDrop =
    (sectionIdx: number) => (e: React.DragEvent) => {
      e.preventDefault();
      if (!result || !dragInfo) return;
      if (dragInfo.sectionIdx !== sectionIdx) return;
      const from = dragInfo.trackIdx;
      const to = computeTargetFromCursor(sectionIdx, e.clientY);
      setDragInfo(null);
      setHoverIdx(null);
      if (to == null || from === to) return;
      const nextPhases = result.phases.map((p, i) => {
        if (i !== sectionIdx) return p;
        const reordered = [...p.tracks];
        const [moved] = reordered.splice(from, 1);
        reordered.splice(to, 0, moved);
        return { ...p, tracks: reordered };
      });
      setResult({ ...result, phases: nextPhases });
      void syncBeatport(nextPhases);
    };

  // For each row, compute the translate-Y% offset to apply while a drag
  // is in flight. Rows between the drag source and the hover target
  // slide up or down by 100% of their own height so the empty slot
  // follows the cursor.
  const rowOffsetFor = (sectionIdx: number, trackIdx: number): number => {
    if (!dragInfo || dragInfo.sectionIdx !== sectionIdx) return 0;
    if (hoverIdx == null) return 0;
    if (trackIdx === dragInfo.trackIdx) return 0;
    if (dragInfo.trackIdx < hoverIdx) {
      if (trackIdx > dragInfo.trackIdx && trackIdx <= hoverIdx) return -100;
    } else if (dragInfo.trackIdx > hoverIdx) {
      if (trackIdx >= hoverIdx && trackIdx < dragInfo.trackIdx) return 100;
    }
    return 0;
  };

  // Re-roll a single section in the current result.
  const [rerollingIdx, setRerollingIdx] = useState<number | null>(null);
  const rerollSectionAction = async (idx: number) => {
    if (!result || rerollingIdx != null) return;
    setRerollingIdx(idx);

    // Build current_picks payload from the current result
    const currentPicks: Record<number, BuiltPick["track"][]> = {};
    result.phases.forEach((p, i) => {
      currentPicks[i] = p.tracks.map((pt) => pt.track);
    });
    const excludeIds = result.phases[idx].tracks.map((pt) => pt.track.id);

    const cleaned = sections.map((s) => ({
      duration_min: s.duration_min,
      prompt: s.prompt.trim(),
    }));

    try {
      const r = await fetch("/api/build/reroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: cleaned,
          reroll_index: idx,
          current_picks: currentPicks,
          exclude_ids: excludeIds,
          force_camelot: forceCamelot,
        }),
      });
      if (!r.body) throw new Error("no body");
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let newPicks: BuiltPick[] | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          if (chunk.startsWith("data: ")) {
            const ev = JSON.parse(chunk.slice(6));
            if (ev.type === "done") {
              newPicks = ev.result.tracks as BuiltPick[];
            } else if (ev.type === "error") {
              throw new Error(String(ev.msg));
            }
          }
        }
      }
      if (newPicks) {
        const nextPhases = result.phases.map((p, i) =>
          i === idx ? { ...p, tracks: newPicks! } : p
        );
        setResult({ ...result, phases: nextPhases });
        void syncBeatport(nextPhases);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRerollingIdx(null);
    }
  };

  const canBuild = sections.every(
    (s) => s.prompt.trim().length >= 3 && s.duration_min >= 3
  );

  return (
    <div className="flex-1 grid grid-cols-[460px_1fr_auto] grid-rows-[minmax(0,1fr)] min-h-0">
      {/* LEFT: Timeline + Sections */}
      <aside className="border-r border-[var(--border)] overflow-y-auto bg-[var(--bg)] p-5">
        <div className="space-y-5">
          <div>
            <div className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] uppercase mb-1">
              Set Builder
            </div>
            <h1 className="text-base font-semibold text-[var(--fg)]">
              Carve the arc, section by section.
            </h1>
            <p className="text-[12px] text-[var(--fg-dim)] mt-1 leading-relaxed">
              Each section has its own brief. The AI composes them as ONE
              continuous set — tracks flow between sections, not in isolation.
            </p>
          </div>

          {/* Name (on top) */}
          <div>
            <div className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] uppercase mb-1">
              Set name (optional)
            </div>
            <Input
              placeholder="auto from first section"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
          </div>

          {/* Timeline visualization */}
          <TimelineEditor
            sections={sections}
            selectedId={selectedSectionId}
            onSelect={setSelectedSectionId}
            onResize={(leftId, rightId, leftMin, rightMin) =>
              setSections((ss) =>
                ss.map((s) =>
                  s.id === leftId
                    ? { ...s, duration_min: leftMin }
                    : s.id === rightId
                      ? { ...s, duration_min: rightMin }
                      : s
                )
              )
            }
          />

          {/* Sections list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] uppercase">
                Sections ({sections.length})
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={randomize}
                  className="text-[11px] font-mono text-[var(--accent-2)] hover:brightness-125 cursor-pointer tracking-wider"
                  title="Replace all sections with a random coherent DJ-set blueprint"
                >
                  ⚄ RANDOMIZE
                </button>
                <button
                  onClick={addSection}
                  disabled={sections.length >= 8}
                  className="text-[11px] font-mono text-[var(--accent)] hover:brightness-125 disabled:text-[var(--fg-mute)] cursor-pointer tracking-wider"
                >
                  + ADD SECTION
                </button>
              </div>
            </div>
            {sections.map((s, i) => (
              <SectionEditor
                key={s.id}
                index={i + 1}
                section={s}
                placeholder={PLACEHOLDERS[i % PLACEHOLDERS.length]}
                selected={selectedSectionId === s.id}
                onFocus={() => setSelectedSectionId(s.id)}
                onDurationChange={(v) =>
                  updateSection(s.id, { duration_min: v })
                }
                onPromptChange={(v) => updateSection(s.id, { prompt: v })}
                onRemove={() => removeSection(s.id)}
                canRemove={sections.length > 1}
              />
            ))}
          </div>

          <div className="flex items-start gap-2 py-1">
            <Checkbox
              checked={forceCamelot}
              onChange={setForceCamelot}
              label="Force Camelot chain"
            />
          </div>
          {forceCamelot && (
            <div className="text-[11px] font-mono text-[var(--fg-mute)] leading-relaxed -mt-3 pl-5">
              Every consecutive track must mix harmonically. Picks that can't
              chain get dropped — expect fewer tracks.
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            onClick={onBuild}
            disabled={building || !canBuild}
            className="w-full"
          >
            {building ? "BUILDING…" : `BUILD ${totalDuration}-MIN SET`}
          </Button>

          {error && (
            <div className="text-xs text-[var(--danger)] font-mono bg-[color-mix(in_srgb,var(--danger)_10%,var(--bg-elev))] border border-[var(--danger)] p-2 rounded-sm">
              {error}
            </div>
          )}

          {result && (
            <div className="border-t border-[var(--border-soft)] pt-4 space-y-3">
              {result.beatport_id ? (
                <a
                  href={`https://www.beatport.com/library/playlists/${result.beatport_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button variant="accent" size="md" className="w-full">
                    ▶ OPEN ON BEATPORT
                  </Button>
                </a>
              ) : result.beatport_error ? (
                <div className="text-[11px] text-[var(--warn)] font-mono bg-[var(--bg-elev-2)] border border-[var(--warn)] p-2 rounded-sm leading-relaxed">
                  Beatport push failed: {result.beatport_error}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </aside>

      {/* CENTER: Tracklist + bottom player */}
      <div className="flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto min-h-0 min-w-0">
          {!result && !building && (
          <div className="h-full flex items-center justify-center text-[var(--fg-mute)] text-sm text-center px-10">
            <div>
              <div className="font-mono text-xs uppercase tracking-wider mb-2">
                Empty deck
              </div>
              <div>
                Fill each section's brief, hit BUILD. The AI will flow tracks
                across your timeline.
              </div>
            </div>
          </div>
        )}

        {building && <BuildProgress status={buildStatus} />}

        {result && (
          <div className="p-6 space-y-6">
            <div className="pb-4 border-b border-[var(--border-soft)] space-y-1">
              <div className="text-[11px] font-mono tracking-[0.2em] text-[var(--fg-mute)] uppercase">
                Generated Set
              </div>
              <h2 className="text-xl font-bold text-[var(--fg)] leading-tight">
                {result.playlist_name}
              </h2>
              <div className="flex items-baseline gap-3 pt-1">
                <div className="font-mono text-xs text-[var(--fg-dim)]">
                  {result.strategy.phases.length} sections ·{" "}
                  {formatMin(result.strategy.duration_min)} ·{" "}
                  {flatPicks.length} tracks
                </div>
                <div className="text-[11px] font-mono text-[var(--fg-mute)]">
                  pool: {result.pool_size} candidates
                </div>
              </div>
            </div>

            {result.phases.map((p, i) => (
              <div key={`${p.phase.name}-${i}`} className="min-w-0">
                <div className="flex items-baseline gap-3 mb-2">
                  <div className="text-xs font-mono tracking-wider uppercase text-[var(--accent-2)]">
                    S{i + 1} · {p.phase.name}
                  </div>
                  <div className="text-[11px] font-mono text-[var(--fg-mute)]">
                    {p.phase.duration_min}m · {p.phase.bpm_min}-
                    {p.phase.bpm_max} BPM · {p.phase.energy}
                  </div>
                  <div className="flex-1" />
                  <button
                    onClick={() => rerollSectionAction(i)}
                    disabled={rerollingIdx != null}
                    className={cn(
                      "text-[11px] font-mono tracking-wider uppercase cursor-pointer",
                      rerollingIdx === i
                        ? "text-[var(--accent)] animate-pulse"
                        : rerollingIdx != null
                          ? "text-[var(--fg-mute)] cursor-not-allowed"
                          : "text-[var(--fg-dim)] hover:text-[var(--accent)]"
                    )}
                  >
                    {rerollingIdx === i ? "↻ rerolling…" : "↻ re-roll"}
                  </button>
                </div>
                <div className="text-[12px] text-[var(--fg-dim)] italic mb-3">
                  "{p.phase.description}"
                </div>

                {p.tracks.length === 0 ? (
                  <Card className="p-4 text-xs text-[var(--fg-mute)]">
                    No tracks picked for this section.
                  </Card>
                ) : (
                  <div
                    ref={setSectionRef(i)}
                    onDragOver={onSectionDragOver(i)}
                    onDrop={onSectionDrop(i)}
                    className="space-y-1.5"
                  >
                    {p.tracks.map((pt, trackIdx) => {
                      const entry = flatPicks.find(
                        (f) => f.pick.track.id === pt.track.id
                      );
                      const isDragging =
                        dragInfo?.sectionIdx === i &&
                        dragInfo?.trackIdx === trackIdx;
                      return (
                        <TrackRow
                          key={pt.track.id}
                          index={entry?.index ?? 0}
                          track={pt.track}
                          why={pt.why}
                          transition_note={pt.transition_note}
                          selected={selectedTrackId === pt.track.id}
                          playing={playingId === pt.track.id}
                          onSelect={() => onSelectTrack(pt.track.id)}
                          onPlayToggle={() => onSelectTrack(pt.track.id)}
                          onReplace={() => openReplaceModal(i, pt.track.id)}
                          onDelete={() => deleteTrack(i, pt.track.id)}
                          onDragStart={() => onRowDragStart(i, trackIdx)}
                          onDragEnd={onRowDragEnd}
                          dragging={isDragging}
                          rowOffsetPct={rowOffsetFor(i, trackIdx)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </div>

        {/* Bottom player — fixed at center column bottom, survives scroll */}
        <BottomPlayer
          trackId={selectedTrackId}
          nextTrackId={nextPickTrackId}
          onPlayingChange={(playing) =>
            setPlayingId(playing ? selectedTrackId : null)
          }
          onEnded={advanceToNextTrack}
          onPrev={prevPickTrackId != null ? goToPrevTrack : null}
          onNext={nextPickTrackId != null ? advanceToNextTrack : null}
        />
      </div>

      {/* RIGHT: Details — closes WITHOUT stopping playback */}
      {detailsOpen && selectedTrackId != null && (
        <PreviewPanel
          trackId={selectedTrackId}
          why={selectedTrack?.pick.why ?? null}
          transition_note={selectedTrack?.pick.transition_note ?? null}
          phase={selectedTrack?.phase.name ?? null}
          onClose={() => setDetailsOpen(false)}
        />
      )}

      {/* Replace track modal */}
      {replaceTarget &&
        (() => {
          // Figure out the track playing BEFORE the replace target, so we
          // can compute a predicted transition note for each candidate.
          const targetSection = result?.phases[replaceTarget.sectionIdx];
          const idxInSection =
            targetSection?.tracks.findIndex(
              (pt) => pt.track.id === replaceTarget.trackId
            ) ?? -1;
          let prevTrack: PoolTrack | null = null;
          if (idxInSection > 0 && targetSection) {
            prevTrack = targetSection.tracks[idxInSection - 1].track;
          } else if (replaceTarget.sectionIdx > 0 && result) {
            const prevSection = result.phases[replaceTarget.sectionIdx - 1];
            prevTrack =
              prevSection?.tracks[prevSection.tracks.length - 1]?.track ??
              null;
          }
          return (
            <ReplaceModal
              loading={replaceLoading}
              candidates={replaceCandidates}
              previewId={selectedTrackId}
              prevTrack={prevTrack}
              onClose={() => {
                setReplaceTarget(null);
                setReplaceCandidates([]);
              }}
              onPreview={(t) => {
                setSelectedTrackId(t.id);
              }}
              onCommit={confirmReplace}
            />
          );
        })()}
    </div>
  );
}

// ── Replace modal ────────────────────────────────────────────────────────
//
// The modal only covers the strip BETWEEN the top nav and the bottom player
// (top-14 / bottom-28). That way the bottom player stays visible and
// interactive — clicking a candidate sets the selected track so it plays
// in the real player, and the user can scrub / pause to audition before
// committing with the explicit REPLACE button.

function ReplaceModal({
  loading,
  candidates,
  previewId,
  prevTrack,
  onClose,
  onPreview,
  onCommit,
}: {
  loading: boolean;
  candidates: PoolTrack[];
  previewId: number | null;
  prevTrack: PoolTrack | null;
  onClose: () => void;
  onPreview: (t: PoolTrack) => void;
  onCommit: (t: PoolTrack) => void;
}) {
  return (
    <div
      className="fixed left-0 right-0 top-14 bottom-28 z-50 flex items-start justify-center bg-black/70 p-6 pt-8"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-elev)] border border-[var(--border)] rounded-sm w-[920px] max-w-full max-h-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] uppercase">
              Replace Track
            </div>
            <div className="text-sm text-[var(--fg)]">
              Click a row to preview it in the player, hit REPLACE to commit
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] hover:text-[var(--fg)] cursor-pointer"
          >
            CLOSE
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading && <ReplaceLoadingBar />}
          {!loading && candidates.length === 0 && (
            <div className="text-[var(--fg-mute)] text-xs font-mono p-4 text-center">
              No alternatives found.
            </div>
          )}
          {candidates.map((t) => {
            const previewing = previewId === t.id;
            const predictedTransition = prevTrack
              ? describeTransition(
                  prevTrack.camelot,
                  t.camelot,
                  prevTrack.bpm,
                  t.bpm
                )
              : "opener";
            const artists = t.artists.join(", ");
            const mix =
              t.mix_name && t.mix_name !== "Original Mix"
                ? ` (${t.mix_name})`
                : "";
            return (
              <div
                key={t.id}
                className={cn(
                  "group border rounded-sm p-2 pr-3 flex items-stretch gap-3 transition-colors",
                  previewing
                    ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-elev-2))]"
                    : "border-[var(--border-soft)] bg-[var(--bg-elev)] hover:border-[var(--border)] hover:bg-[var(--bg-elev-2)]"
                )}
              >
                {/* Album art with preview overlay */}
                <button
                  type="button"
                  onClick={() => onPreview(t)}
                  className="relative h-16 w-16 shrink-0 bg-[var(--border-soft)] rounded-sm overflow-hidden cursor-pointer"
                  style={
                    t.image_url
                      ? {
                          backgroundImage: `url(${t.image_url})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                  aria-label="Preview this track"
                >
                  <div
                    className={cn(
                      "absolute inset-0 flex items-center justify-center transition-opacity",
                      previewing
                        ? "bg-black/50 opacity-100"
                        : "bg-black/40 opacity-0 group-hover:opacity-100"
                    )}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-6 w-6 text-white drop-shadow"
                      fill="currentColor"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </button>

                {/* Meta (click to preview) */}
                <button
                  type="button"
                  onClick={() => onPreview(t)}
                  className="flex-1 min-w-0 flex flex-col justify-between py-0.5 text-left cursor-pointer"
                >
                  <div>
                    <div className="text-xs text-[var(--fg-dim)] truncate">
                      {artists}
                    </div>
                    <div
                      className={cn(
                        "text-sm truncate mt-0.5",
                        previewing
                          ? "text-[var(--accent)]"
                          : "text-[var(--fg)]"
                      )}
                    >
                      {t.name}
                      <span className="text-[var(--fg-mute)]">{mix}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    {t.bpm && (
                      <span className="chip font-mono">{t.bpm} bpm</span>
                    )}
                    {t.camelot && (
                      <span className="chip chip-accent-2 font-mono">
                        {t.camelot}
                      </span>
                    )}
                    {t.genre && (
                      <span className="chip truncate max-w-[160px]">
                        {t.genre}
                      </span>
                    )}
                  </div>
                </button>

                {/* Predicted transition note */}
                <div className="hidden md:flex flex-col justify-center gap-1 w-[220px] shrink-0 text-right">
                  <div className="text-[10px] font-mono text-[var(--fg-mute)] uppercase tracking-wider">
                    If picked
                  </div>
                  <div className="text-[11px] font-mono text-[var(--accent-2)] leading-snug whitespace-normal break-words">
                    → {predictedTransition}
                  </div>
                </div>

                {/* Replace commit button */}
                <div className="flex items-center shrink-0">
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => onCommit(t)}
                  >
                    Replace
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Replace-modal loading bar ───────────────────────────────────────────
// The replace-track endpoint isn't streamed, so we show a fake-progress
// bar on a timer: three quick steps (analyze → search → rank) that loop
// until the candidates arrive. It's the minimal version of BuildProgress
// just enough to show the user that work is happening.

const REPLACE_STEPS = [
  { label: "analyzing section brief", target: 25 },
  { label: "searching Beatport catalog", target: 70 },
  { label: "ranking candidates", target: 92 },
];

function ReplaceLoadingBar() {
  const [pct, setPct] = useState(5);
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    // Slowly creep upward. Each step has a target pct; we interpolate
    // toward it. When we reach within 3% we advance to the next step.
    const id = setInterval(() => {
      setPct((cur) => {
        const target = REPLACE_STEPS[stepIdx]?.target ?? 92;
        if (cur >= target - 1) {
          setStepIdx((s) => Math.min(s + 1, REPLACE_STEPS.length - 1));
          return cur + 0.5;
        }
        return cur + (target - cur) * 0.08;
      });
    }, 120);
    return () => clearInterval(id);
  }, [stepIdx]);

  return (
    <div className="px-4 py-6 space-y-3">
      <div className="text-[11px] font-mono text-[var(--accent)] uppercase tracking-wider animate-pulse">
        {REPLACE_STEPS[stepIdx]?.label ?? "loading"}…
      </div>
      <div className="h-1 bg-[var(--border)] rounded-sm overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-[width] duration-200"
          style={{ width: `${Math.min(95, pct)}%` }}
        />
      </div>
      <div className="text-[10px] font-mono text-[var(--fg-mute)] text-right">
        {Math.round(pct)}%
      </div>
    </div>
  );
}

// ── Build progress (streaming, step-based) ──────────────────────────────

function BuildProgress({ status }: { status: BuildStatus }) {
  const overall = calcProgress(status);
  return (
    <div className="h-full flex items-center justify-center px-12 py-10">
      <div className="w-full max-w-md space-y-8">
        {/* Title */}
        <div className="text-center space-y-2">
          <div className="text-[11px] font-mono tracking-[0.3em] text-[var(--fg-mute)] uppercase">
            Building set
          </div>
          <div className="text-2xl font-bold text-[var(--fg)] leading-tight">
            composing your{" "}
            <span className="text-[var(--accent)]">timeline</span>
          </div>
          <div className="waveform h-3 mx-auto w-48 opacity-50" />
        </div>

        {/* Steps */}
        <div className="space-y-5">
          <Step
            index={1}
            title="Strategy"
            state={status.steps.strategy}
            detail={
              status.strategy
                ? `${status.strategy.phases} phases · ${status.strategy.queries} search queries`
                : "extracting from sections…"
            }
          />
          <Step
            index={2}
            title="Beatport Search"
            state={status.steps.search}
            detail={
              status.search?.lastQuery && status.steps.search === "active"
                ? `→ "${status.search.lastQuery}"`
                : status.pool_size != null
                  ? `${status.pool_size} unique tracks in pool`
                  : "querying catalog…"
            }
            progress={
              status.search
                ? { done: status.search.done, total: status.search.total }
                : undefined
            }
          />
          <Step
            index={3}
            title="Compose"
            state={status.steps.compose}
            detail={
              status.picks != null
                ? `${status.picks} tracks picked, sections ordered`
                : "cross-section flow + camelot ranking…"
            }
          />
          <Step
            index={4}
            title="Save & Push"
            state={status.steps.save}
            detail={
              status.save_name
                ? status.beatport_id
                  ? `pushed to Beatport (${status.beatport_id})`
                  : status.beatport_error
                    ? `local save only — Beatport: ${status.beatport_error.slice(0, 50)}`
                    : `saved as ${status.save_name}`
                : "writing local DB…"
            }
          />
        </div>

        {/* Overall progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-[var(--fg-mute)]">
            <span className="uppercase tracking-wider">Overall</span>
            <span className="text-[var(--accent)]">{Math.round(overall)}%</span>
          </div>
          <div className="h-1 bg-[var(--border)] rounded-sm overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-[width] duration-300"
              style={{ width: `${overall}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({
  index,
  title,
  state,
  detail,
  progress,
}: {
  index: number;
  title: string;
  state: StepState;
  detail?: string;
  progress?: { done: number; total: number };
}) {
  return (
    <div className="flex items-start gap-4">
      {/* Status badge */}
      <div
        className={cn(
          "h-9 w-9 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
          state === "done"
            ? "border-[var(--accent-2)] bg-[color-mix(in_srgb,var(--accent-2)_15%,transparent)]"
            : state === "active"
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
              : "border-[var(--border)]"
        )}
      >
        {state === "done" ? (
          <svg
            viewBox="0 0 12 12"
            className="h-3.5 w-3.5 text-[var(--accent-2)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : state === "active" ? (
          <div className="h-3.5 w-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="text-[11px] font-mono text-[var(--fg-mute)]">
            {index}
          </span>
        )}
      </div>

      {/* Title + detail + sub-progress */}
      <div className="flex-1 min-w-0 pt-1">
        <div
          className={cn(
            "text-sm font-bold uppercase tracking-wider transition-colors",
            state === "done"
              ? "text-[var(--accent-2)]"
              : state === "active"
                ? "text-[var(--accent)]"
                : "text-[var(--fg-mute)]"
          )}
        >
          {title}
        </div>
        {detail && (
          <div className="text-[12px] text-[var(--fg-dim)] mt-0.5 font-mono leading-relaxed truncate">
            {detail}
          </div>
        )}
        {progress && state !== "pending" && (
          <div className="mt-2 space-y-0.5">
            <div className="h-[3px] bg-[var(--border)] rounded-sm overflow-hidden">
              <div
                className={cn(
                  "h-full transition-[width] duration-200",
                  state === "done"
                    ? "bg-[var(--accent-2)]"
                    : "bg-[var(--accent)]"
                )}
                style={{
                  width: `${
                    (progress.done / Math.max(1, progress.total)) * 100
                  }%`,
                }}
              />
            </div>
            <div className="text-[10px] font-mono text-[var(--fg-mute)] text-right">
              {progress.done} / {progress.total}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section editor row ───────────────────────────────────────────────────

function SectionEditor({
  index,
  section,
  placeholder,
  selected,
  onFocus,
  onDurationChange,
  onPromptChange,
  onRemove,
  canRemove,
}: {
  index: number;
  section: TimelineSectionView;
  placeholder: string;
  selected: boolean;
  onFocus: () => void;
  onDurationChange: (v: number) => void;
  onPromptChange: (v: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div
      onClick={onFocus}
      className={cn(
        "rounded-sm border p-2 space-y-2 transition-colors",
        selected
          ? "border-[var(--accent)] bg-[var(--bg-elev-2)]"
          : "border-[var(--border-soft)] bg-[var(--bg-elev)] hover:border-[var(--border)]"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-5 w-5 shrink-0 rounded-sm flex items-center justify-center text-[11px] font-mono font-bold",
            selected
              ? "bg-[var(--accent)] text-black"
              : "bg-[var(--bg-elev-2)] text-[var(--fg-dim)] border border-[var(--border)]"
          )}
        >
          {index}
        </span>
        <Input
          type="number"
          min={3}
          max={240}
          value={section.duration_min}
          onChange={(e) =>
            onDurationChange(
              Math.max(3, Math.min(240, Number(e.target.value) || 3))
            )
          }
          className="w-16 h-7 text-xs text-center"
        />
        <span className="text-[11px] font-mono text-[var(--fg-mute)]">min</span>
        <div className="flex-1" />
        {canRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="text-[11px] font-mono text-[var(--fg-mute)] hover:text-[var(--danger)] cursor-pointer"
          >
            REMOVE
          </button>
        )}
      </div>
      <Textarea
        value={section.prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="font-mono text-[12px]"
        onFocus={onFocus}
      />
    </div>
  );
}
