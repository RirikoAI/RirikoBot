import type { Wallpaper } from './types.js';

export type WallpaperSourceId = 'wallhaven' | 'zerochan' | 'konachan';

export interface WallpaperSourceInfo {
  id: WallpaperSourceId;
  label: string;
  description: string;
}

/** Sources in menu order. All are SFW-only REST/JSON APIs. */
export const WALLPAPER_SOURCES: readonly WallpaperSourceInfo[] = [
  { id: 'wallhaven', label: 'WallHaven', description: 'Desktop-sized anime wallpapers' },
  { id: 'zerochan', label: 'Zerochan', description: 'Anime art and mobile wallpapers by tag' },
  { id: 'konachan', label: 'Konachan', description: 'High-resolution anime wallpapers by tag' },
];

export interface WallpaperProvider {
  /** One page of results; an empty page means the source has nothing more. */
  search(query: string, page: number): Promise<Wallpaper[]>;
  /** Fills in `imageUrl` for results that need an extra lookup. */
  resolveImageUrl?(id: string): Promise<string | null>;
}

interface SourceState {
  page: number;
  pool: Wallpaper[];
  seen: Set<string>;
  exhausted: boolean;
}

/**
 * One user's wallpaper search. It remembers which results each source has already shown, so
 * "load more" never repeats a wallpaper and fetches further pages only when needed.
 */
export class WallpaperSession {
  private readonly states = new Map<WallpaperSourceId, SourceState>();

  constructor(
    readonly query: string,
    private readonly providers: Record<WallpaperSourceId, WallpaperProvider>,
    private readonly random: () => number,
  ) {}

  /** Up to `count` random, not-yet-shown wallpapers; fewer (or none) when the source runs out. */
  async next(source: WallpaperSourceId, count = 3): Promise<Wallpaper[]> {
    const provider = this.providers[source];
    const state = this.stateFor(source);
    const picked: Wallpaper[] = [];

    while (picked.length < count) {
      if (state.pool.length === 0) {
        if (state.exhausted) break;
        state.page += 1;
        const page = await provider.search(this.query, state.page);
        const fresh = page.filter((w) => !state.seen.has(w.id));
        if (fresh.length === 0) {
          state.exhausted = true;
          break;
        }
        state.pool.push(...fresh);
      }

      const [wallpaper] = state.pool.splice(Math.floor(this.random() * state.pool.length), 1);
      state.seen.add(wallpaper!.id);
      const resolved = await this.resolve(provider, wallpaper!);
      if (resolved) picked.push(resolved);
    }
    return picked;
  }

  private async resolve(
    provider: WallpaperProvider,
    wallpaper: Wallpaper,
  ): Promise<Wallpaper | null> {
    if (wallpaper.imageUrl) return wallpaper;
    const imageUrl = await provider.resolveImageUrl?.(wallpaper.id);
    return imageUrl ? { ...wallpaper, imageUrl } : null;
  }

  private stateFor(source: WallpaperSourceId): SourceState {
    let state = this.states.get(source);
    if (!state) {
      state = { page: 0, pool: [], seen: new Set(), exhausted: false };
      this.states.set(source, state);
    }
    return state;
  }
}

export class WallpaperService {
  constructor(
    private readonly providers: Record<WallpaperSourceId, WallpaperProvider>,
    private readonly random: () => number = Math.random,
  ) {}

  createSession(query: string): WallpaperSession {
    return new WallpaperSession(query.trim(), this.providers, this.random);
  }
}
