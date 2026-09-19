import { RateLimiter, fetchWithRetry } from './rate-limiter.js';
import { titlesMatch } from './anilist.client.js';

export interface DanbooruArt {
  postId: number;
  imageUrl: string;
  artist: string | null;
  width: number;
  height: number;
}

interface DanbooruTag {
  name: string;
  post_count: number;
}

interface DanbooruPost {
  id: number;
  rating: string;
  file_ext: string;
  image_width: number;
  image_height: number;
  large_file_url?: string;
  file_url?: string;
  tag_string_general: string;
  tag_string_artist: string;
  tag_string_character: string;
  is_deleted?: boolean;
  is_banned?: boolean;
}

const USER_AGENT = 'RirikoTCG/2.0 (card builder)';
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const REJECT_TAGS = [
  'comic',
  'multiple_views',
  'text_only_page',
  'character_sheet',
  'nude',
  'underwear',
  // Another character or merchandise in frame, or text covering the art
  'cosplay',
  'character_doll',
  'speech_bubble',
  'english_text',
];

/** "Rukia Kuchiki (Sode no Shirayuki)" -> ["rukia_kuchiki", "kuchiki_rukia", "rukia"] */
export function danbooruTagVariants(name: string): string[] {
  const words = name
    .replace(/\(.*?\)/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9.' -]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [];
  const variants = [words.join('_')];
  if (words.length > 1) variants.push([...words].reverse().join('_'));
  if (words.length > 1) variants.push(words[0]!);
  return [...new Set(variants)];
}

function qualifierOf(tag: string): string | null {
  const m = /_\(([^)]+)\)$/.exec(tag);
  return m ? m[1]!.replace(/_/g, ' ') : null;
}

/**
 * Danbooru client (https://danbooru.donmai.us/wiki_pages/help:api).
 * Used for high-resolution, safe-rated (rating:g) solo artwork. Anonymous reads are allowed;
 * we self-limit to 1 request/second.
 */
export class DanbooruClient {
  private readonly baseUrl = 'https://danbooru.donmai.us';
  private readonly limiter: RateLimiter;
  private readonly fetchFn: typeof fetch | undefined;

  constructor(options: { limiter?: RateLimiter; fetchFn?: typeof fetch } = {}) {
    this.limiter = options.limiter ?? new RateLimiter(1000);
    this.fetchFn = options.fetchFn;
  }

  private async getJson<T>(pathAndQuery: string): Promise<T> {
    const res = await fetchWithRetry(
      `${this.baseUrl}${pathAndQuery}`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
      { limiter: this.limiter, fetchFn: this.fetchFn },
    );
    if (!res.ok) throw new Error(`Danbooru request failed: HTTP ${res.status} ${pathAndQuery}`);
    return (await res.json()) as T;
  }

  /**
   * Resolves the character tag from one or more spellings of the name. Prefers a tag whose
   * "(series)" qualifier matches one of the titles, then the most-used tag.
   */
  async resolveCharacterTag(
    names: string | readonly string[],
    titles: string | readonly string[] = [],
  ): Promise<string | null> {
    const titleList = (typeof titles === 'string' ? [titles] : titles).filter(Boolean);
    const matchesTitle = (tag: string) => {
      const q = qualifierOf(tag);
      return q !== null && titleList.some((title) => titlesMatch(q, title));
    };

    // Full names (both word orders) first; first-name-only fallbacks ("soi" for "Soi Fon") last.
    const specific: string[] = [];
    const firstNameOnly: string[] = [];
    for (const name of typeof names === 'string' ? [names] : names) {
      const [full, reversed, first] = danbooruTagVariants(name);
      if (full) specific.push(full);
      if (reversed) specific.push(reversed);
      if (first) firstNameOnly.push(first);
    }
    const variants = [...new Set([...specific, ...firstNameOnly])];

    for (const variant of variants) {
      // A first-name-only fallback is ambiguous: accept it only on a series-qualifier match.
      const isFirstNameOnly = !specific.includes(variant);
      const query = new URLSearchParams({
        'search[name_or_alias_matches]': `${variant}*`,
        'search[category]': '4',
        'search[order]': 'count',
        limit: '20',
        only: 'name,post_count',
      });
      const tags = await this.getJson<DanbooruTag[]>(`/tags.json?${query.toString()}`);

      const usable = tags.filter(
        (t) =>
          t.post_count > 0 &&
          // Skip costume variants such as ganyu_(twilight_blossom)_(genshin_impact)
          (t.name.match(/_\(/g)?.length ?? 0) <= 1 &&
          // A tag qualified with another series (yuuki_asuna_(nozokima_2)) is another character.
          (qualifierOf(t.name) === null || matchesTitle(t.name)),
      );
      const prefixMatches = usable.filter(
        (t) => t.name === variant || t.name.startsWith(`${variant}_(`),
      );
      // A tag that does not start with a full-name variant matched through an alias
      // (soi_fon -> sui-feng). Single words are too loose for alias matching.
      const aliasMatches = variant.includes('_')
        ? usable.filter((t) => !t.name.startsWith(variant))
        : [];
      const candidates = prefixMatches.length > 0 ? prefixMatches : aliasMatches;
      if (candidates.length === 0) continue;

      const bySeries = candidates.find((t) => matchesTitle(t.name));
      if (bySeries) return bySeries.name;
      if (isFirstNameOnly) continue;
      return candidates[0]!.name; // already ordered by post count
    }
    return null;
  }

  /** Picks the highest-scored safe, solo, portrait-oriented artwork for a character tag. */
  async findPortrait(characterTag: string): Promise<DanbooruArt | null> {
    const query = new URLSearchParams({
      tags: `${characterTag} rating:g order:score`,
      limit: '60',
      only: 'id,rating,file_ext,image_width,image_height,large_file_url,file_url,tag_string_general,tag_string_artist,tag_string_character,is_deleted,is_banned',
    });
    const posts = await this.getJson<DanbooruPost[]>(`/posts.json?${query.toString()}`);

    const usable = posts.filter((p) => {
      if (p.rating !== 'g' || p.is_deleted || p.is_banned) return false;
      if (!IMAGE_EXTS.has(p.file_ext)) return false;
      if (!(p.large_file_url ?? p.file_url)) return false;
      if (Math.min(p.image_width, p.image_height) < 600) return false;
      const general = ` ${p.tag_string_general} `;
      if (!general.includes(' solo ')) return false;
      return !REJECT_TAGS.some((t) => general.includes(` ${t} `));
    });

    // Best: only this character tagged, tall portrait. Then relax character count, then shape.
    const characterCount = (p: DanbooruPost) =>
      p.tag_string_character.split(' ').filter(Boolean).length;
    const portrait = (p: DanbooruPost) => p.image_height >= p.image_width * 1.15;
    const squareish = (p: DanbooruPost) => p.image_height >= p.image_width * 0.9;
    const pick =
      usable.find((p) => characterCount(p) === 1 && portrait(p)) ??
      usable.find((p) => characterCount(p) === 1 && squareish(p)) ??
      usable.find((p) => characterCount(p) <= 2 && portrait(p)) ??
      usable.find((p) => characterCount(p) <= 2 && squareish(p));
    if (!pick) return null;

    return {
      postId: pick.id,
      imageUrl: (pick.large_file_url ?? pick.file_url)!,
      artist: pick.tag_string_artist.split(' ').filter(Boolean)[0] ?? null,
      width: pick.image_width,
      height: pick.image_height,
    };
  }
}

/** Downloads an image through a limiter. Returns null on a non-OK response. */
export async function downloadImage(
  url: string,
  limiter: RateLimiter,
  fetchFn?: typeof fetch,
): Promise<Buffer | null> {
  const res = await fetchWithRetry(
    url,
    { headers: { 'User-Agent': USER_AGENT } },
    { limiter, fetchFn },
  );
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}
