// Camelot wheel utilities for harmonic mixing.
// Beatport returns key as e.g. "F Minor" → Camelot "4A".

const KEY_TO_CAMELOT: Record<string, string> = {
  "Ab Minor": "1A",
  "B Major": "1B",
  "Eb Minor": "2A",
  "Gb Major": "2B",
  "F# Major": "2B",
  "Bb Minor": "3A",
  "Db Major": "3B",
  "C# Major": "3B",
  "F Minor": "4A",
  "Ab Major": "4B",
  "C Minor": "5A",
  "Eb Major": "5B",
  "D# Minor": "2A",
  "G Minor": "6A",
  "Bb Major": "6B",
  "D Minor": "7A",
  "F Major": "7B",
  "A Minor": "8A",
  "C Major": "8B",
  "E Minor": "9A",
  "G Major": "9B",
  "B Minor": "10A",
  "D Major": "10B",
  "F# Minor": "11A",
  "Gb Minor": "11A",
  "A Major": "11B",
  "Db Minor": "12A",
  "C# Minor": "12A",
  "E Major": "12B",
};

export function toCamelot(keyName: string | null | undefined): string | null {
  if (!keyName) return null;
  return KEY_TO_CAMELOT[keyName.trim()] ?? null;
}

function parseCamelot(code: string): { num: number; letter: "A" | "B" } | null {
  const m = /^(\d{1,2})([AB])$/.exec(code);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  if (num < 1 || num > 12) return null;
  return { num, letter: m[2] as "A" | "B" };
}

/**
 * Compatible neighbours on the Camelot wheel: same position,
 * ±1 on the wheel, or the opposite letter at the same position (relative).
 */
export function compatibleNeighbours(code: string): string[] {
  const p = parseCamelot(code);
  if (!p) return [];
  const next = p.num === 12 ? 1 : p.num + 1;
  const prev = p.num === 1 ? 12 : p.num - 1;
  const flip = p.letter === "A" ? "B" : "A";
  return [
    `${p.num}${p.letter}`, // same
    `${next}${p.letter}`, // energy boost
    `${prev}${p.letter}`, // energy drop
    `${p.num}${flip}`, // mood change (relative major/minor)
  ];
}

export type TransitionQuality = "perfect" | "energy" | "mood" | "fight";

export function transitionQuality(
  from: string | null,
  to: string | null
): TransitionQuality {
  if (!from || !to) return "fight";
  const a = parseCamelot(from);
  const b = parseCamelot(to);
  if (!a || !b) return "fight";
  if (a.num === b.num && a.letter === b.letter) return "perfect";
  if (a.num === b.num && a.letter !== b.letter) return "mood";
  const diff = Math.abs(a.num - b.num);
  const wrap = Math.min(diff, 12 - diff);
  if (wrap === 1 && a.letter === b.letter) return "energy";
  return "fight";
}

export function describeTransition(
  fromKey: string | null,
  toKey: string | null,
  fromBpm: number | null,
  toBpm: number | null
): string {
  const q = transitionQuality(fromKey, toKey);
  const parts: string[] = [];
  switch (q) {
    case "perfect":
      parts.push("perfect match");
      break;
    case "energy":
      parts.push("energy shift (±1 wheel)");
      break;
    case "mood":
      parts.push("relative mood shift");
      break;
    case "fight":
      parts.push("key clash — mix via drums");
      break;
  }
  if (fromBpm && toBpm) {
    const delta = toBpm - fromBpm;
    if (delta === 0) parts.push("same BPM");
    else if (Math.abs(delta) <= 2) parts.push(`${delta > 0 ? "+" : ""}${delta} BPM`);
    else parts.push(`${delta > 0 ? "+" : ""}${delta} BPM (pitch bend)`);
  }
  return parts.join(", ");
}
