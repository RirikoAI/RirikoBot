import { API_BASE } from './constants.js';
import { StarterError } from './errors.js';

/** The part of a fetch response the starter reads. The global `fetch` fits. */
export interface ResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<ResponseLike>;

/** A release tag without a suffix: v2.0.0. Release candidates (v2.0.0-rc.8) do not match. */
const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const TAGS_PER_PAGE = 100;
const MAX_TAG_PAGES = 5;
const TIMEOUT_MS = 20_000;

export function isStableTag(tag: string): boolean {
  return STABLE_TAG.test(tag);
}

function parts(tag: string): [number, number, number] {
  const match = STABLE_TAG.exec(tag);
  return [Number(match?.[1]), Number(match?.[2]), Number(match?.[3])];
}

/** Orders stable tags by version number. */
export function compareTags(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] as number) - (right[index] as number);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The highest stable tag in the list, or null when there is none. */
export function highestStableTag(names: readonly string[]): string | null {
  const stable = names.filter(isStableTag);
  if (stable.length === 0) return null;
  return stable.reduce((best, tag) => (compareTags(tag, best) > 0 ? tag : best));
}

/** The image tag of a release tag: v2.0.0 becomes 2.0.0. */
export function imageTag(ref: string): string {
  return ref.replace(/^v/, '');
}

const RETRY_HINT = 'Try again later, or pass the release yourself with --ref v2.0.0.';

async function getJson(
  fetchFn: FetchLike,
  url: string,
  userAgent: string,
): Promise<{ status: number; body: unknown }> {
  let response: ResponseLike;
  try {
    response = await fetchFn(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': userAgent },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new StarterError(
      `Could not reach GitHub to find the newest release (${reason}). Check your internet connection. ${RETRY_HINT}`,
    );
  }
  if (response.status === 404) return { status: 404, body: null };
  if (response.status === 403 || response.status === 429) {
    throw new StarterError(
      `GitHub refused the request (HTTP ${response.status}), probably a rate limit. ${RETRY_HINT}`,
    );
  }
  if (!response.ok) {
    throw new StarterError(
      `GitHub answered HTTP ${response.status} when looking for the newest release. ${RETRY_HINT}`,
    );
  }
  try {
    return { status: response.status, body: await response.json() };
  } catch {
    throw new StarterError(`GitHub sent an answer that is not JSON. ${RETRY_HINT}`);
  }
}

function stringField(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : null;
}

/**
 * The newest release tag: the latest GitHub release when its tag is a stable vX.Y.Z, otherwise the
 * highest stable vX.Y.Z tag of the repository.
 */
export async function findLatestRelease(fetchFn: FetchLike, userAgent: string): Promise<string> {
  const latest = await getJson(fetchFn, `${API_BASE}/releases/latest`, userAgent);
  const name = stringField(latest.body, 'tag_name');
  if (name !== null && isStableTag(name)) return name;

  const names: string[] = [];
  for (let page = 1; page <= MAX_TAG_PAGES; page++) {
    const result = await getJson(
      fetchFn,
      `${API_BASE}/tags?per_page=${TAGS_PER_PAGE}&page=${page}`,
      userAgent,
    );
    if (result.status === 404 || !Array.isArray(result.body)) break;
    for (const entry of result.body) {
      const tag = stringField(entry, 'name');
      if (tag !== null) names.push(tag);
    }
    if (result.body.length < TAGS_PER_PAGE) break;
  }
  const best = highestStableTag(names);
  if (best === null) {
    throw new StarterError(`No Ririko release was found on GitHub. ${RETRY_HINT}`);
  }
  return best;
}
