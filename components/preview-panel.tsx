"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "./ui";
import { formatDuration } from "@/lib/utils";

// Raw Beatport track detail shape — most fields are optional because we
// render whatever the API hands back without failing on missing ones.
interface BeatportDetails {
  id: number;
  name: string;
  mix_name?: string | null;
  slug?: string | null;
  isrc?: string | null;
  catalog_number?: string | null;
  label_track_identifier?: string | null;
  audio_format?: string | null;
  length?: string | null;
  length_ms?: number | null;
  bpm?: number | null;
  number?: number | null;
  encoded_date?: string | null;
  publish_date?: string | null;
  new_release_date?: string | null;
  desc?: string | null;
  exclusive?: boolean;
  was_ever_exclusive?: boolean;
  exclusive_period?: {
    id?: number;
    days?: number;
    description?: string;
  } | null;
  is_explicit?: boolean;
  is_classic?: boolean;
  is_hype?: boolean;
  is_dj_edit?: boolean;
  is_ugc_remix?: boolean;
  is_available_for_streaming?: boolean;
  available_worldwide?: boolean;
  hidden?: boolean;
  sale_type?: { id?: number; name?: string } | null;
  publish_status?: string | null;
  current_status?: { name?: string } | null;
  price?:
    | {
        code?: string;
        symbol?: string;
        display?: string;
        value?: number;
      }
    | null;
  sample_url?: string | null;
  sample_start_ms?: number | null;
  sample_end_ms?: number | null;
  artists?: Array<{ id: number; name: string; slug?: string }>;
  remixers?: Array<{ id: number; name: string; slug?: string }>;
  key?: {
    name?: string;
    camelot_number?: number;
    camelot_letter?: string;
  } | null;
  genre?: { id?: number; name?: string } | null;
  sub_genre?: { id?: number; name?: string } | null;
  release?: {
    id?: number;
    name?: string;
    slug?: string;
    catalog_number?: string;
    label?: { id?: number; name?: string; slug?: string };
    image?: { uri?: string; dynamic_uri?: string };
  } | null;
  image?: { uri?: string; dynamic_uri?: string };
  free_downloads?: unknown[];
  free_download_start_date?: string | null;
  free_download_end_date?: string | null;
}

export interface PreviewPanelProps {
  trackId: number | null;
  why?: string | null;
  transition_note?: string | null;
  phase?: string | null;
  onClose: () => void;
}

// Shared react-query key for all /api/tracks/{id} fetches — the bottom
// player uses the exact same key when it prefetches the next track, so
// when the user clicks on a preloaded row the details panel opens with
// cached data and no extra network round-trip.
async function fetchTrackDetails(id: number): Promise<BeatportDetails> {
  const r = await fetch(`/api/tracks/${id}`);
  if (!r.ok) throw new Error("failed to load");
  const data = await r.json();
  if ("error" in data) throw new Error(data.error);
  return data;
}

export function PreviewPanel({
  trackId,
  why,
  transition_note,
  phase,
  onClose,
}: PreviewPanelProps) {
  const { data: details, error } = useQuery({
    queryKey: ["track-detail", trackId],
    queryFn: () => fetchTrackDetails(trackId!),
    enabled: trackId != null,
    staleTime: 60_000,
  });

  if (trackId == null) {
    return (
      <aside className="w-[380px] border-l border-[var(--border)] bg-[var(--bg-elev)] flex flex-col shrink-0">
        <PanelHeader />
        <div className="flex-1 flex items-center justify-center text-[var(--fg-mute)] text-xs text-center px-10">
          Select a track to see its full details.
        </div>
      </aside>
    );
  }

  if (error) {
    return (
      <aside className="w-[380px] border-l border-[var(--border)] bg-[var(--bg-elev)] flex flex-col shrink-0">
        <PanelHeader onClose={onClose} />
        <div className="flex-1 flex items-center justify-center text-[var(--danger)] text-xs font-mono p-4 text-center">
          {(error as Error).message}
        </div>
      </aside>
    );
  }

  if (!details) {
    return (
      <aside className="w-[380px] border-l border-[var(--border)] bg-[var(--bg-elev)] flex flex-col shrink-0">
        <PanelHeader onClose={onClose} />
        <div className="flex-1 flex items-center justify-center text-[var(--accent)] text-xs font-mono animate-pulse">
          Loading track…
        </div>
      </aside>
    );
  }

  const t = details;
  const artists = (t.artists ?? []).map((a) => a.name).join(", ");
  const remixers = (t.remixers ?? []).map((r) => r.name).join(", ");
  const mix = t.mix_name && t.mix_name !== "Original Mix" ? ` (${t.mix_name})` : "";
  const imageUrl = t.release?.image?.uri ?? t.image?.uri ?? null;
  const camelot =
    t.key?.camelot_number && t.key?.camelot_letter
      ? `${t.key.camelot_number}${t.key.camelot_letter}`
      : null;
  const beatportUrl =
    t.slug && t.id ? `https://www.beatport.com/track/${t.slug}/${t.id}` : null;

  // Gather flag badges
  const flags: string[] = [];
  if (t.is_hype) flags.push("HYPE");
  if (t.is_classic) flags.push("CLASSIC");
  if (t.is_explicit) flags.push("EXPLICIT");
  if (t.exclusive) flags.push("EXCLUSIVE");
  if (t.is_dj_edit) flags.push("DJ EDIT");
  if (t.is_ugc_remix) flags.push("UGC REMIX");

  return (
    <aside className="w-[380px] border-l border-[var(--border)] bg-[var(--bg-elev)] flex flex-col shrink-0 overflow-y-auto">
      <PanelHeader onClose={onClose} />

      <div className="p-4 space-y-5 flex-1">
        {/* Hero art */}
        <div
          className="aspect-square w-full bg-[var(--border-soft)] rounded-sm overflow-hidden relative"
          style={
            imageUrl
              ? {
                  backgroundImage: `url(${imageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          {/* Flags overlay */}
          {flags.length > 0 && (
            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
              {flags.map((f) => (
                <span
                  key={f}
                  className="chip chip-accent font-mono text-[10px] backdrop-blur-sm bg-black/50"
                >
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Title block */}
        <div>
          <div className="text-xs text-[var(--fg-dim)]">{artists}</div>
          <div className="text-base font-semibold text-[var(--fg)] leading-tight">
            {t.name}
            <span className="text-[var(--fg-mute)]">{mix}</span>
          </div>
          {remixers && (
            <div className="text-[11px] font-mono text-[var(--fg-mute)] mt-1">
              <span className="text-[var(--fg-mute)]">rmx: </span>
              {remixers}
            </div>
          )}
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-3 gap-1 text-center border-y border-[var(--border-soft)] py-3">
          <Stat label="BPM" value={t.bpm ?? "—"} />
          <Stat label="Key" value={camelot ?? "—"} highlight />
          <Stat label="Len" value={formatDuration(t.length_ms ?? null)} />
        </div>

        {/* OPEN ON BEATPORT — promoted right under the key stats */}
        {beatportUrl && (
          <a
            href={beatportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Button variant="accent" size="md" className="w-full">
              ▶ OPEN ON BEATPORT
            </Button>
          </a>
        )}

        {/* Build context (only from /build) */}
        {(phase || why || transition_note) && (
          <Section title="Set Context">
            {phase && <Row label="Phase" value={phase} />}
            {why && (
              <div className="text-xs text-[var(--fg)] italic leading-relaxed mt-2">
                "{why}"
              </div>
            )}
            {transition_note && (
              <div className="text-xs text-[var(--accent-2)] font-mono mt-1">
                → {transition_note}
              </div>
            )}
          </Section>
        )}

        {/* Genre */}
        <Section title="Genre">
          <Row label="Main" value={t.genre?.name ?? "—"} />
          {t.sub_genre?.name && <Row label="Sub" value={t.sub_genre.name} />}
          <Row
            label="Key"
            value={
              t.key?.name
                ? `${t.key.name}${camelot ? ` · ${camelot}` : ""}`
                : "—"
            }
          />
        </Section>

        {/* Release info */}
        <Section title="Release">
          <Row label="Title" value={t.release?.name ?? "—"} />
          <Row label="Label" value={t.release?.label?.name ?? "—"} />
          <Row label="Catalog #" value={t.catalog_number ?? t.release?.catalog_number ?? "—"} />
          <Row label="Release Date" value={t.publish_date ?? "—"} />
          {t.new_release_date && (
            <Row label="New Release" value={t.new_release_date} />
          )}
          <Row label="Encoded" value={t.encoded_date ?? "—"} />
        </Section>

        {/* Commerce */}
        <Section title="Commerce">
          {t.price?.display && (
            <Row label="Price" value={t.price.display} highlight />
          )}
          {t.sale_type?.name && <Row label="Sale Type" value={t.sale_type.name} />}
          <Row
            label="Worldwide"
            value={t.available_worldwide ? "yes" : "no"}
          />
          <Row
            label="Streamable"
            value={t.is_available_for_streaming ? "yes" : "no"}
          />
          {t.exclusive_period?.description &&
            t.exclusive_period.description !== "Not exclusive" && (
              <Row
                label="Excl. Period"
                value={t.exclusive_period.description}
              />
            )}
        </Section>

        {/* Technical / IDs */}
        <Section title="Technical">
          <Row label="Track ID" value={String(t.id)} mono />
          {t.isrc && <Row label="ISRC" value={t.isrc} mono />}
          {t.label_track_identifier && (
            <Row label="Label Trk ID" value={t.label_track_identifier} mono />
          )}
          {t.audio_format && <Row label="Audio Fmt" value={t.audio_format} />}
          <Row label="Publish Status" value={t.publish_status ?? "—"} />
          {t.current_status?.name && (
            <Row label="Status" value={t.current_status.name} />
          )}
        </Section>

        {/* Sample */}
        {t.sample_url && (
          <Section title="Preview">
            <Row
              label="Sample In"
              value={formatDuration(t.sample_start_ms ?? null)}
              mono
            />
            <Row
              label="Sample Out"
              value={formatDuration(t.sample_end_ms ?? null)}
              mono
            />
          </Section>
        )}
      </div>
    </aside>
  );
}

// ── Layout helpers ───────────────────────────────────────────────────────

function PanelHeader({ onClose }: { onClose?: () => void }) {
  return (
    <div className="sticky top-0 bg-[var(--bg-elev)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between z-10">
      <div className="text-xs font-mono tracking-wider text-[var(--fg)] uppercase font-semibold">
        Details
      </div>
      {onClose && (
        <Button variant="ghost" size="sm" onClick={onClose}>
          CLOSE
        </Button>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-mono tracking-wider text-[var(--fg)] uppercase mb-1.5 font-semibold">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 text-[12px]">
      <div className="text-[var(--fg-mute)] uppercase tracking-wider min-w-[80px] shrink-0">
        {label}
      </div>
      <div
        className={`${mono ? "font-mono" : ""} text-[var(--fg)] truncate flex-1 text-right ${
          highlight ? "text-[var(--accent-2)]" : ""
        }`}
        title={String(value)}
      >
        {value}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-[var(--fg-mute)] font-mono uppercase">
        {label}
      </div>
      <div
        className={`font-mono text-sm ${
          highlight ? "text-[var(--accent-2)]" : "text-[var(--fg)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
