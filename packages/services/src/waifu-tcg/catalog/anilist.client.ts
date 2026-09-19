import { RateLimiter, fetchWithRetry } from './rate-limiter.js';

export interface AniListCharacter {
  id: number;
  name: string;
  imageUrl: string | null;
  favourites: number;
  mediaTitles: string[];
}

interface AniListResponse {
  data?: {
    Page?: {
      characters?: Array<{
        id: number;
        name: { full: string | null };
        image: { large: string | null } | null;
        favourites: number | null;
        media: {
          nodes: Array<{ title: { romaji: string | null; english: string | null } }>;
        } | null;
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

const SEARCH_QUERY = `
query ($search: String) {
  Page(perPage: 8) {
    characters(search: $search, sort: [SEARCH_MATCH, FAVOURITES_DESC]) {
      id
      name { full }
      image { large }
      favourites
      media(perPage: 6, sort: [POPULARITY_DESC]) { nodes { title { romaji english } } }
    }
  }
}`;

export function normalizeTitle(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** True when either title contains the other after stripping punctuation and case. */
export function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * AniList GraphQL client (https://docs.anilist.co). No API key required.
 * AniList allows 90 req/min (currently degraded to 30), so the default interval is 2.5 s.
 */
export class AniListClient {
  private readonly endpoint = 'https://graphql.anilist.co';
  private readonly limiter: RateLimiter;
  private readonly fetchFn: typeof fetch | undefined;

  constructor(options: { limiter?: RateLimiter; fetchFn?: typeof fetch } = {}) {
    this.limiter = options.limiter ?? new RateLimiter(2500);
    this.fetchFn = options.fetchFn;
  }

  /**
   * Finds the character whose media list matches `animeTitle`, falling back to the best search match.
   */
  async findCharacter(name: string, animeTitle?: string): Promise<AniListCharacter | null> {
    const res = await fetchWithRetry(
      this.endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: name } }),
      },
      { limiter: this.limiter, fetchFn: this.fetchFn },
    );
    if (!res.ok) throw new Error(`AniList search failed for "${name}": HTTP ${res.status}`);

    const body = (await res.json()) as AniListResponse;
    if (body.errors?.length) {
      throw new Error(`AniList search failed for "${name}": ${body.errors[0]!.message}`);
    }

    const results = (body.data?.Page?.characters ?? []).map((c) => ({
      id: c.id,
      name: c.name.full ?? name,
      imageUrl: c.image?.large ?? null,
      favourites: c.favourites ?? 0,
      mediaTitles: (c.media?.nodes ?? []).flatMap((n) =>
        [n.title.romaji, n.title.english].filter((t): t is string => Boolean(t)),
      ),
    }));
    if (results.length === 0) return null;

    if (animeTitle) {
      const byAnime = results.find((c) => c.mediaTitles.some((t) => titlesMatch(t, animeTitle)));
      if (byAnime) return byAnime;
    }
    return results[0]!;
  }
}
