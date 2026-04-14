// Helper for shaping a raw BeatportTrack into the Track row format the
// library grid + bottom player consume. Used by /api/playlists/[id],
// /api/charts/[id] and /api/search routes when they hand Beatport
// responses to the UI.

import { type BeatportTrack } from "./beatport";
import { toCamelot } from "./camelot";

// Flat Track type — replaces the old drizzle-inferred schema type now
// that we no longer persist anything in a local DB.
export interface Track {
  id: number;
  name: string;
  mix_name: string | null;
  artists: string[];
  remixers: string[];
  label: string | null;
  genre: string | null;
  sub_genre: string | null;
  bpm: number | null;
  key_name: string | null;
  camelot: string | null;
  length_ms: number | null;
  release_date: string | null;
  image_url: string | null;
  slug: string | null;
  sample_url: string | null;
  sample_start_ms: number | null;
  sample_end_ms: number | null;
}

export function mapTrack(bt: BeatportTrack): Track {
  const cam =
    bt.key?.camelot_number && bt.key?.camelot_letter
      ? `${bt.key.camelot_number}${bt.key.camelot_letter}`
      : toCamelot(bt.key?.name);
  return {
    id: bt.id,
    name: bt.name,
    mix_name: bt.mix_name ?? null,
    artists: (bt.artists ?? []).map((a) => a.name),
    remixers: (bt.remixers ?? []).map((a) => a.name),
    label: bt.release?.label?.name ?? null,
    genre: bt.genre?.name ?? null,
    sub_genre: bt.sub_genre?.name ?? null,
    bpm: bt.bpm ?? null,
    key_name: bt.key?.name ?? null,
    camelot: cam,
    length_ms: bt.length_ms ?? null,
    release_date: bt.publish_date ?? null,
    image_url: bt.release?.image?.uri ?? bt.image?.uri ?? null,
    slug: bt.slug ?? null,
    sample_url: bt.sample_url ?? null,
    sample_start_ms: bt.sample_start_ms ?? null,
    sample_end_ms: bt.sample_end_ms ?? null,
  };
}
