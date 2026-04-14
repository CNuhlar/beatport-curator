"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Track } from "@/lib/sync";
import { LibraryCard } from "@/components/library-card";
import { PreviewPanel } from "@/components/preview-panel";
import { BottomPlayer } from "@/components/bottom-player";
import { Button, Input, RangeSlider, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

interface Playlist {
  id: number;
  name: string;
  track_count: number;
  bpm_range?: [number, number];
  genres?: string[];
}

interface Chart {
  id: number;
  name: string;
  track_count: number;
  image?: { uri?: string };
  person?: { owner_name?: string };
  genres?: Array<{ name: string }>;
}

type Source =
  | { kind: "none" }
  | { kind: "playlist"; id: number; name: string }
  | { kind: "chart"; id: number; name: string };

interface FilterState {
  search: string;
  bpm: [number, number];
  genre: string;
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  bpm: [80, 180],
  genre: "",
};

async function fetchPlaylists(): Promise<{ playlists: Playlist[] }> {
  const r = await fetch("/api/playlists");
  if (!r.ok) throw new Error("failed to load playlists");
  return r.json();
}

async function fetchCharts(): Promise<{ charts: Chart[] }> {
  const r = await fetch("/api/charts?per_page=40");
  if (!r.ok) throw new Error("failed to load charts");
  return r.json();
}

async function fetchPlaylistTracks(id: number): Promise<{ tracks: Track[] }> {
  const r = await fetch(`/api/playlists/${id}`);
  if (!r.ok) throw new Error("failed to load playlist");
  return r.json();
}

async function fetchChartTracks(id: number): Promise<{ tracks: Track[] }> {
  const r = await fetch(`/api/charts/${id}`);
  if (!r.ok) throw new Error("failed to load chart");
  return r.json();
}

async function fetchBeatportSearch(q: string): Promise<{
  tracks: Track[];
  count: number;
}> {
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&per_page=60`);
  if (!r.ok) throw new Error("failed to search Beatport");
  return r.json();
}

export default function LibraryPage() {
  const [source, setSource] = useState<Source>({ kind: "none" });
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);

  // Debounced search query — when non-empty, fetch live Beatport catalog
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search.trim()), 350);
    return () => clearTimeout(t);
  }, [filters.search]);
  const isSearching = debouncedSearch.length >= 2;

  const beatportSearchQ = useQuery({
    queryKey: ["beatport-search", debouncedSearch],
    queryFn: () => fetchBeatportSearch(debouncedSearch),
    enabled: isSearching,
    staleTime: 60_000,
  });

  // Beatport user playlists (left sidebar)
  const { data: plData } = useQuery({
    queryKey: ["playlists"],
    queryFn: fetchPlaylists,
    staleTime: 60_000,
  });

  // Beatport DJ charts (left sidebar, bottom section)
  const { data: chData } = useQuery({
    queryKey: ["charts"],
    queryFn: fetchCharts,
    staleTime: 60_000,
  });

  const playlistQ = useQuery({
    queryKey: ["playlist-tracks", source.kind === "playlist" ? source.id : null],
    queryFn: () =>
      fetchPlaylistTracks(source.kind === "playlist" ? source.id : 0),
    enabled: source.kind === "playlist",
  });

  const chartQ = useQuery({
    queryKey: ["chart-tracks", source.kind === "chart" ? source.id : null],
    queryFn: () =>
      fetchChartTracks(source.kind === "chart" ? source.id : 0),
    enabled: source.kind === "chart",
  });

  const isLoading =
    (source.kind === "playlist" && playlistQ.isLoading) ||
    (source.kind === "chart" && chartQ.isLoading);

  // When user is searching, results override whatever source is active.
  const sourceTracks: Track[] = isSearching
    ? (beatportSearchQ.data?.tracks as Track[]) ?? []
    : source.kind === "playlist"
      ? (playlistQ.data?.tracks as Track[]) ?? []
      : source.kind === "chart"
        ? (chartQ.data?.tracks as Track[]) ?? []
        : [];

  // Pool genres from whatever source is currently loaded — used to
  // populate the genre dropdown when the user is actively filtering.
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    for (const t of sourceTracks) {
      const g = t.sub_genre ?? t.genre;
      if (g) set.add(g);
    }
    return [...set].sort();
  }, [sourceTracks]);

  // Client-side filtering. When isSearching, the search query is already
  // applied server-side by Beatport — skip the local text filter.
  const filteredTracks = useMemo(() => {
    let out = sourceTracks;
    if (!isSearching && filters.search) {
      const q = filters.search.toLowerCase();
      out = out.filter((t) => {
        const artists = (t.artists as string[]).join(" ").toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          artists.includes(q) ||
          (t.label?.toLowerCase().includes(q) ?? false)
        );
      });
    }
    if (filters.bpm[0] > 80 || filters.bpm[1] < 180) {
      out = out.filter(
        (t) => t.bpm == null || (t.bpm >= filters.bpm[0] && t.bpm <= filters.bpm[1])
      );
    }
    if (filters.genre) {
      out = out.filter(
        (t) => t.genre === filters.genre || t.sub_genre === filters.genre
      );
    }
    return out;
  }, [sourceTracks, filters, isSearching]);

  // Click on a card → select + autoplay in panel. Tracking which card is
  // currently "playing" comes from the panel's onPlayingChange callback.
  const onSelectTrack = (id: number) => {
    setSelectedId(id);
    setDetailsOpen(true);
  };

  // Playlist navigation — compute prev/next from the visible list.
  const currentTrackIndex =
    selectedId == null
      ? -1
      : filteredTracks.findIndex((t) => t.id === selectedId);
  const prevTrackId =
    currentTrackIndex > 0 ? filteredTracks[currentTrackIndex - 1].id : null;
  const nextTrackId =
    currentTrackIndex >= 0 && currentTrackIndex < filteredTracks.length - 1
      ? filteredTracks[currentTrackIndex + 1].id
      : null;
  const advanceToNextTrack = () => {
    if (nextTrackId != null) setSelectedId(nextTrackId);
  };
  const goToPrevTrack = () => {
    if (prevTrackId != null) setSelectedId(prevTrackId);
  };

  const totalTracks = sourceTracks.length;

  const sourceLabel = isSearching
    ? "Beatport Search"
    : source.kind === "playlist"
      ? "Playlist"
      : source.kind === "chart"
        ? "DJ Chart"
        : "Library";

  return (
    <div className="flex-1 grid grid-cols-[260px_1fr_auto] grid-rows-[minmax(0,1fr)] min-h-0">
      {/* LEFT: Search + Playlists + Charts + Filters */}
      <aside className="border-r border-[var(--border)] bg-[var(--bg)] flex flex-col min-h-0">
        {/* Search (top) */}
        <div className="border-b border-[var(--border-soft)] p-4 shrink-0">
          <div className="text-xs font-mono tracking-wider text-[var(--fg-mute)] uppercase mb-2 font-semibold">
            Search Beatport
          </div>
          <Input
            placeholder="artist, title, label..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          {isSearching && beatportSearchQ.isFetching && (
            <div className="text-[11px] font-mono text-[var(--accent)] mt-1.5 animate-pulse">
              searching beatport…
            </div>
          )}
        </div>

        {/* My Playlists */}
        <div className="border-b border-[var(--border-soft)] p-4 shrink-0">
          <div className="text-xs font-mono tracking-wider text-[var(--fg-mute)] uppercase mb-2 font-semibold">
            My Playlists
          </div>
          <div className="space-y-0.5">
            {(plData?.playlists ?? []).map((pl) => (
              <PlaylistItem
                key={pl.id}
                label={pl.name}
                count={pl.track_count}
                active={source.kind === "playlist" && source.id === pl.id}
                onClick={() =>
                  setSource({ kind: "playlist", id: pl.id, name: pl.name })
                }
              />
            ))}
            {!plData && (
              <div className="text-[11px] font-mono text-[var(--fg-mute)] italic px-2 py-1">
                loading…
              </div>
            )}
          </div>
        </div>

        {/* Beatport DJ Charts — fills remaining space */}
        <div className="flex-1 flex flex-col min-h-0 border-b border-[var(--border-soft)]">
          <div className="text-xs font-mono tracking-wider text-[var(--fg-mute)] uppercase mb-2 flex items-center justify-between font-semibold px-4 pt-4 shrink-0">
            <span>Beatport DJ Charts</span>
            <span className="text-[var(--fg-mute)] normal-case tracking-normal text-[11px] font-normal">
              latest
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1 min-h-0">
            {(chData?.charts ?? []).map((ch) => (
              <ChartItem
                key={ch.id}
                chart={ch}
                active={source.kind === "chart" && source.id === ch.id}
                onClick={() =>
                  setSource({ kind: "chart", id: ch.id, name: ch.name })
                }
              />
            ))}
            {!chData && (
              <div className="text-[11px] font-mono text-[var(--fg-mute)] italic px-2 py-1">
                loading charts…
              </div>
            )}
          </div>
        </div>

        {/* Filters — only when actively searching Beatport */}
        {isSearching && (
          <div className="p-4 space-y-5 shrink-0">
            <div>
              <div className="text-xs font-mono tracking-wider text-[var(--fg-mute)] uppercase mb-2 font-semibold">
                BPM
              </div>
              <RangeSlider
                min={80}
                max={180}
                value={filters.bpm}
                onChange={(v) => setFilters({ ...filters, bpm: v })}
              />
            </div>

            <div>
              <div className="text-xs font-mono tracking-wider text-[var(--fg-mute)] uppercase mb-2 font-semibold">
                Genre
              </div>
              <Select
                value={filters.genre}
                onChange={(e) => setFilters({ ...filters, genre: e.target.value })}
              >
                <option value="">All genres</option>
                {allGenres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setFilters({ ...DEFAULT_FILTERS, search: filters.search })
              }
            >
              RESET FILTERS
            </Button>
          </div>
        )}
      </aside>

      {/* CENTER: Grid */}
      <div className="flex flex-col min-w-0 overflow-hidden">
        <div className="border-b border-[var(--border)] px-6 py-4 flex items-center gap-4 shrink-0">
          <div>
            <div className="text-xs font-mono tracking-wider text-[var(--fg-mute)] uppercase font-semibold">
              {sourceLabel}
            </div>
            <div className="font-mono text-sm text-[var(--fg)]">
              {isSearching ? (
                <>
                  <span className="text-[var(--accent-2)]">
                    "{debouncedSearch}"
                  </span>
                  {" · "}
                </>
              ) : source.kind !== "none" ? (
                <>
                  <span className="text-[var(--accent-2)]">{source.name}</span>
                  {" · "}
                </>
              ) : null}
              {filteredTracks.length}{" "}
              <span className="text-[var(--fg-mute)]">
                / {totalTracks} tracks
              </span>
            </div>
          </div>
          <div className="flex-1" />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-[var(--fg-mute)] text-sm">Loading…</div>
          ) : filteredTracks.length === 0 ? (
            <div className="text-[var(--fg-mute)] text-sm text-center py-20">
              {totalTracks === 0 ? (
                <>
                  No tracks here yet. Pick a playlist or chart from the left,
                  or search Beatport above.
                </>
              ) : (
                "No tracks match these filters."
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-1.5">
              {filteredTracks.map((t) => (
                <LibraryCard
                  key={t.id}
                  track={t}
                  selected={selectedId === t.id}
                  playing={playingId === t.id}
                  onSelect={() => onSelectTrack(t.id)}
                  onPlayToggle={() => onSelectTrack(t.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Bottom player — fixed at center column bottom, survives scroll */}
        <BottomPlayer
          trackId={selectedId}
          nextTrackId={nextTrackId}
          onPlayingChange={(playing) =>
            setPlayingId(playing ? selectedId : null)
          }
          onEnded={advanceToNextTrack}
          onPrev={prevTrackId != null ? goToPrevTrack : null}
          onNext={nextTrackId != null ? advanceToNextTrack : null}
        />
      </div>

      {/* RIGHT: Details — closes WITHOUT stopping playback */}
      {detailsOpen && selectedId != null && (
        <PreviewPanel
          trackId={selectedId}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </div>
  );
}

function PlaylistItem({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm text-xs cursor-pointer transition-colors",
        active
          ? "bg-[var(--bg-elev-2)] text-[var(--accent)] font-medium"
          : "text-[var(--fg-dim)] hover:bg-[var(--bg-elev)] hover:text-[var(--fg)]"
      )}
    >
      <span className="truncate text-left">{label}</span>
      <span
        className={cn(
          "shrink-0 text-[11px] font-mono",
          active ? "text-[var(--accent)]" : "text-[var(--fg-mute)]"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function ChartItem({
  chart,
  active,
  onClick,
}: {
  chart: Chart;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-sm cursor-pointer transition-colors text-left border",
        active
          ? "bg-[var(--bg-elev-2)] border-[var(--accent)]"
          : "border-transparent hover:bg-[var(--bg-elev)] hover:border-[var(--border-soft)]"
      )}
    >
      <div
        className="h-11 w-11 shrink-0 rounded-sm bg-[var(--border-soft)] bg-cover bg-center"
        style={
          chart.image?.uri
            ? { backgroundImage: `url(${chart.image.uri})` }
            : undefined
        }
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-xs font-medium truncate leading-tight",
            active ? "text-[var(--accent)]" : "text-[var(--fg)]"
          )}
        >
          {chart.name}
        </div>
        <div className="text-[11px] font-mono text-[var(--fg-mute)] truncate mt-0.5">
          {chart.person?.owner_name ?? "—"}
        </div>
        <div className="text-[11px] font-mono text-[var(--fg-mute)] truncate">
          {chart.track_count} {chart.track_count === 1 ? "track" : "tracks"}
        </div>
      </div>
    </button>
  );
}
