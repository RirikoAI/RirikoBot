import { z } from 'zod';
import type { SafeTool, AnimeSearchResult, ToolExecutionContext } from '../types.js';

export const AnimeSearchArgsSchema = z.object({
  title: z.string().min(1, 'Anime title must not be empty').max(120),
});

export type AnimeSearchArgs = z.infer<typeof AnimeSearchArgsSchema>;

export type AnimeSearchProvider = (title: string) => Promise<AnimeSearchResult | null>;

export class AnimeSearchTool implements SafeTool<AnimeSearchArgs, AnimeSearchResult> {
  readonly definition = {
    name: 'anime.search',
    description: 'Searches AniList database for anime synopsis, episode count, status, and community rating score.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The anime title or keyword to search for (e.g. "Frieren", "Steins;Gate", "Attack on Titan").',
        },
      },
      required: ['title'],
    },
  };

  readonly schema = AnimeSearchArgsSchema;
  readonly moduleName = 'anime';

  private readonly searchProvider?: AnimeSearchProvider | undefined;

  constructor(searchProvider?: AnimeSearchProvider) {
    this.searchProvider = searchProvider;
  }

  async execute(args: AnimeSearchArgs, _context: ToolExecutionContext): Promise<AnimeSearchResult> {
    if (this.searchProvider) {
      const result = await this.searchProvider(args.title);
      if (result) return result;
    }

    // Default AniList GraphQL fetch
    try {
      const query = `
        query ($search: String) {
          Media (search: $search, type: ANIME) {
            title { romaji english native }
            description(asHtml: false)
            averageScore
            episodes
            status
            siteUrl
          }
        }
      `;

      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { search: args.title } }),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const json = (await res.json()) as {
          data?: {
            Media?: {
              title: { english?: string; romaji?: string; native?: string };
              description?: string;
              averageScore?: number;
              episodes?: number;
              status?: string;
              siteUrl?: string;
            };
          };
        };
        const media = json?.data?.Media;
        if (media) {
          return {
            title: media.title.english || media.title.romaji || media.title.native || args.title,
            synopsis: media.description?.slice(0, 400) || 'No description available.',
            score: media.averageScore ? media.averageScore / 10 : undefined,
            episodes: media.episodes || undefined,
            status: media.status || undefined,
            url: media.siteUrl || undefined,
          };
        }
      }
    } catch {
      // Fallback
    }

    return {
      title: args.title,
      synopsis: `Anime matching query "${args.title}" was not found or the database is currently unreachable.`,
    };
  }
}
