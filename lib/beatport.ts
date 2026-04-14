// Beatport API v4 client.
//
// Token storage: HttpOnly cookie `bp_token` set by the login route.
// No filesystem IO — each request reads/writes via Next.js cookies().
// Refreshes the access token automatically when expired and rewrites
// the cookie in the response.

import { cookies } from "next/headers";

const API_BASE = "https://api.beatport.com/v4";
const COOKIE_NAME = "bp_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days — refresh_token lifetime

interface Token {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
}

// Process-level cache for the scraped Beatport client_id (rarely changes).
let cachedClientId: string | null = null;

// ── Errors ───────────────────────────────────────────────────────────────

export class BeatportAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BeatportAuthError";
  }
}

export class BeatportAPIError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "BeatportAPIError";
  }
}

// ── Cookie helpers ───────────────────────────────────────────────────────

async function readToken(): Promise<Token | null> {
  const store = await cookies();
  const c = store.get(COOKIE_NAME);
  if (!c?.value) return null;
  try {
    const parsed = JSON.parse(c.value) as Token;
    if (!parsed.access_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeToken(token: Token): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, JSON.stringify(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // localhost — no HTTPS
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

async function deleteToken(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// ── Beatport client_id scraping ──────────────────────────────────────────

async function fetchClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  const html = await fetch(`${API_BASE}/docs/`).then((r) => r.text());
  const scriptMatches = Array.from(
    html.matchAll(/src=["']([^"']*\.js)["']/g)
  ).map((m) => m[1]);
  for (const sp of scriptMatches) {
    const url = sp.startsWith("http") ? sp : `https://api.beatport.com${sp}`;
    const js = await fetch(url).then((r) => r.text());
    const m = js.match(/API_CLIENT_ID:\s*['"]([^'"]+)['"]/);
    if (m) {
      cachedClientId = m[1];
      return cachedClientId;
    }
  }
  throw new BeatportAuthError(
    "Could not scrape Beatport API_CLIENT_ID from docs page."
  );
}

// ── OAuth flows ──────────────────────────────────────────────────────────

// Full OAuth login: username/password → authorization code → access token.
// Mirrors the Python CLI flow (lib/beatport4/client.py _authorize).
export async function loginBeatport(
  username: string,
  password: string
): Promise<Token> {
  const clientId = await fetchClientId();
  const redirectUri = `${API_BASE}/auth/o/post-message/`;

  // Step 1: login with username/password, capture session cookies
  const loginResp = await fetch(`${API_BASE}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!loginResp.ok) {
    const data = await loginResp.json().catch(() => ({}));
    throw new BeatportAuthError(
      `Login failed (${loginResp.status}): ${JSON.stringify(data).slice(0, 200)}`
    );
  }

  const loginData = (await loginResp.json()) as {
    username?: string;
    email?: string;
  };
  if (!loginData.username) {
    throw new BeatportAuthError(
      `Login rejected: ${JSON.stringify(loginData).slice(0, 200)}`
    );
  }

  // Forward Beatport session cookies to the authorize step
  const setCookies = loginResp.headers.getSetCookie?.() ?? [];
  if (setCookies.length === 0) {
    throw new BeatportAuthError("No session cookies returned from login");
  }
  const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");

  // Step 2: authorize — get the code from the 302 Location header
  const authUrl = new URL(`${API_BASE}/auth/o/authorize/`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);

  const authResp = await fetch(authUrl, {
    headers: { Cookie: cookieHeader },
    redirect: "manual",
  });

  const location = authResp.headers.get("location");
  if (!location) {
    const body = await authResp.text().catch(() => "");
    throw new BeatportAuthError(
      `No Location header in authorize response (status=${authResp.status}). Body: ${body.slice(0, 200)}`
    );
  }

  const locUrl = new URL(
    location.startsWith("http") ? location : `${API_BASE}${location}`
  );
  const code = locUrl.searchParams.get("code");
  if (!code) {
    throw new BeatportAuthError(
      `No authorization code in redirect: ${location}`
    );
  }

  // Step 3: exchange code for access token
  const tokenUrl = new URL(`${API_BASE}/auth/o/token/`);
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("grant_type", "authorization_code");
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("client_id", clientId);

  const tokenResp = await fetch(tokenUrl, { method: "POST" });
  if (!tokenResp.ok) {
    const text = await tokenResp.text().catch(() => "");
    throw new BeatportAuthError(
      `Token exchange failed (${tokenResp.status}): ${text.slice(0, 200)}`
    );
  }

  const tokenData = (await tokenResp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const token: Token = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: Date.now() / 1000 + tokenData.expires_in,
  };
  await writeToken(token);
  return token;
}

async function refreshTokenAndStore(token: Token): Promise<Token> {
  const clientId = await fetchClientId();
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
    client_id: clientId,
  });
  const resp = await fetch(`${API_BASE}/auth/o/token/?${params.toString()}`, {
    method: "POST",
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new BeatportAuthError(
      `Beatport refresh failed (${resp.status})${body ? " — " + body.slice(0, 200) : ""}`
    );
  }
  const data = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  const next: Token = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() / 1000 + data.expires_in,
  };
  await writeToken(next);
  return next;
}

export async function clearToken(): Promise<void> {
  await deleteToken();
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    await loadToken();
    return true;
  } catch {
    return false;
  }
}

async function loadToken(): Promise<Token> {
  // Env override (mostly for dev/testing — bypass cookie)
  const envToken = process.env.BEATPORT_ACCESS_TOKEN;
  if (envToken) {
    return {
      access_token: envToken,
      refresh_token: "",
      expires_at: Date.now() / 1000 + 3600,
    };
  }

  const stored = await readToken();
  if (!stored) {
    throw new BeatportAuthError("Not signed in to Beatport");
  }

  if (Date.now() / 1000 >= stored.expires_at - 30) {
    if (!stored.refresh_token) {
      throw new BeatportAuthError("Beatport session expired");
    }
    return refreshTokenAndStore(stored);
  }
  return stored;
}

// ── HTTP layer ───────────────────────────────────────────────────────────

interface FetchOptions {
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

async function apiRaw<T>(
  token: Token,
  path: string,
  opts: FetchOptions
): Promise<{ ok: true; data: T } | { ok: false; status: number; text: string }> {
  const url = new URL(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const resp = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "User-Agent": "BeatportCurator/1.0",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return { ok: false, status: resp.status, text };
  }
  if (resp.status === 204) return { ok: true, data: {} as T };
  return { ok: true, data: (await resp.json()) as T };
}

async function api<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  let token = await loadToken();
  let result = await apiRaw<T>(token, path, opts);

  // 401 → refresh once and retry
  if (!result.ok && result.status === 401 && token.refresh_token) {
    token = await refreshTokenAndStore(token);
    result = await apiRaw<T>(token, path, opts);
  }

  if (!result.ok) {
    throw new BeatportAPIError(
      `${opts.method ?? "GET"} ${path} → ${result.status}: ${result.text.slice(0, 300)}`,
      result.status
    );
  }
  return result.data;
}

// ── API shapes (partial — only fields we use) ────────────────────────────

export interface BeatportArtist {
  id: number;
  name: string;
}

export interface BeatportKey {
  name: string;
  camelot_number?: number;
  camelot_letter?: string;
}

export interface BeatportImage {
  uri?: string;
  dynamic_uri?: string;
}

export interface BeatportGenreRef {
  id: number;
  name: string;
}

export interface BeatportLabelRef {
  id: number;
  name: string;
}

export interface BeatportTrack {
  id: number;
  name: string;
  mix_name?: string;
  slug?: string;
  bpm?: number;
  length_ms?: number;
  length?: string;
  artists?: BeatportArtist[];
  remixers?: BeatportArtist[];
  key?: BeatportKey;
  genre?: BeatportGenreRef;
  sub_genre?: BeatportGenreRef;
  release?: {
    id?: number;
    name?: string;
    catalog_number?: string;
    label?: BeatportLabelRef;
    image?: BeatportImage;
  };
  image?: BeatportImage;
  sample_url?: string;
  sample_start_ms?: number;
  sample_end_ms?: number;
  publish_date?: string;
}

export interface BeatportPlaylist {
  id: number;
  name: string;
  track_count: number;
  created_date?: string;
  updated_date?: string;
  genres?: string[];
  bpm_range?: [number, number];
  is_owner?: boolean;
}

export interface PlaylistTrackEntry {
  id: number; // playlist-entry ID (used for removal)
  position: number;
  track: BeatportTrack;
}

interface Paginated<T> {
  next: string | null;
  previous: string | null;
  count: number;
  page: string;
  per_page: number;
  results: T[];
}

// ── Public methods ───────────────────────────────────────────────────────

export async function getMyAccount(): Promise<{
  id: number;
  username: string;
  email: string;
}> {
  return api("/my/account/");
}

export async function listMyPlaylists(): Promise<BeatportPlaylist[]> {
  // Beatport's default page size is 10, so a single call only returns a
  // handful of playlists even when the user has dozens. Walk every page
  // until `next` is null.
  const all: BeatportPlaylist[] = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const resp = await api<Paginated<BeatportPlaylist> | BeatportPlaylist[]>(
      "/my/playlists/",
      { params: { page, per_page: perPage } }
    );
    if (Array.isArray(resp)) {
      all.push(...resp);
      break;
    }
    all.push(...(resp.results ?? []));
    if (!resp.next) break;
    page += 1;
    if (page > 50) break; // safety cap
  }
  return all;
}

export async function getPlaylistTracks(
  playlistId: number
): Promise<PlaylistTrackEntry[]> {
  const all: PlaylistTrackEntry[] = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const resp = await api<Paginated<PlaylistTrackEntry>>(
      `/my/playlists/${playlistId}/tracks/`,
      { params: { page, per_page: perPage } }
    );
    all.push(...resp.results);
    if (!resp.next) break;
    page += 1;
    if (page > 200) break;
  }
  return all;
}

export async function searchTracks(
  query: string,
  page = 1,
  perPage = 20
): Promise<{ tracks: BeatportTrack[]; count: number }> {
  const resp = await api<{ tracks?: BeatportTrack[]; count?: number }>(
    "/catalog/search/",
    { params: { q: query, type: "tracks", page, per_page: perPage } }
  );
  return { tracks: resp.tracks ?? [], count: resp.count ?? 0 };
}

export async function getTrack(trackId: number): Promise<BeatportTrack> {
  return api(`/catalog/tracks/${trackId}/`);
}

export async function createPlaylist(
  name: string,
  description?: string
): Promise<BeatportPlaylist> {
  return api("/my/playlists/", {
    method: "POST",
    body: description ? { name, description } : { name },
  });
}

export async function addTracksToPlaylist(
  playlistId: number,
  trackIds: number[]
): Promise<unknown> {
  return api(`/my/playlists/${playlistId}/tracks/bulk/`, {
    method: "POST",
    body: { track_ids: trackIds },
  });
}

export async function deletePlaylist(playlistId: number): Promise<void> {
  try {
    await api(`/my/playlists/${playlistId}/`, { method: "DELETE" });
  } catch (e) {
    // 404 = already gone (maybe deleted in a previous run or concurrent
    // call). Anything else — auth failure, server error — should be
    // surfaced so the caller knows the old playlist is still sitting
    // around and failing to be purged.
    if (e instanceof BeatportAPIError && e.status === 404) return;
    throw e;
  }
}

/**
 * Sync a playlist's contents on Beatport by deleting the old playlist
 * and creating a fresh one with the given tracks. This is deliberately
 * destructive — we want the just-edited playlist to bubble to the top
 * of the user's Beatport library (sorted by creation date) every time
 * they touch it.
 *
 * Returns the new Beatport playlist id. If `existingId` is provided we
 * delete that first; deletion failures are ignored so we still proceed
 * to create the new playlist and return its id.
 */
export async function syncPlaylistContents(
  existingId: number | null,
  name: string,
  trackIds: number[]
): Promise<number> {
  if (existingId != null) {
    // Propagate delete errors. If the old playlist can't be removed the
    // user ends up with duplicates on Beatport, so we'd rather fail
    // loudly and let them retry than silently pile up zombies.
    await deletePlaylist(existingId);
  }
  const fresh = await createPlaylist(name);
  const chunkSize = 100;
  for (let i = 0; i < trackIds.length; i += chunkSize) {
    await addTracksToPlaylist(fresh.id, trackIds.slice(i, i + chunkSize));
  }
  return fresh.id;
}

// ── Beatport DJ Charts (curated content) ─────────────────────────────────

export interface BeatportChart {
  id: number;
  name: string;
  slug?: string;
  image?: BeatportImage;
  track_count: number;
  publish_date?: string;
  person?: {
    id?: number;
    owner_name?: string;
    owner_slug?: string;
    owner_image?: string;
  };
  genres?: Array<{ id: number; name: string }>;
}

export async function listCharts(
  page = 1,
  perPage = 30
): Promise<BeatportChart[]> {
  const resp = await api<Paginated<BeatportChart>>("/catalog/charts/", {
    params: { page, per_page: perPage },
  });
  return resp.results ?? [];
}

// Chart tracks are flat BeatportTrack objects (no entry wrapping).
export async function getChartTracks(
  chartId: number
): Promise<BeatportTrack[]> {
  const all: BeatportTrack[] = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const resp = await api<Paginated<BeatportTrack>>(
      `/catalog/charts/${chartId}/tracks/`,
      { params: { page, per_page: perPage } }
    );
    all.push(...resp.results);
    if (!resp.next) break;
    page += 1;
    if (page > 50) break;
  }
  return all;
}
