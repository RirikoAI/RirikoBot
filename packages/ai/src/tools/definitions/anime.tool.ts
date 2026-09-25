import { z } from 'zod';
import type { SafeTool, AnimeSearchResult, ToolExecutionContext } from '../types.js';

export const AnimeSearchArgsSchema = z.object({
  title: z.string().min(1, 'Anime title must not be empty').max(120),
});

export type AnimeSearchArgs = z.infer<typeof AnimeSearchArgsSchema>;

/**
 * Injected by the host app (the bot wires the shared, rate-limited AniList client from
 * @ririko/services). Returns null when nothing matches; throws when the source is unreachable.
 */
export type AnimeSearchProvider = (title: string) => Promise<AnimeSearchResult | null>;

export class AnimeSearchTool implements SafeTool<AnimeSearchArgs, AnimeSearchResult> {
  readonly definition = {
    name: 'anime.search',
    description:
      'Searches AniList database for anime synopsis, episode count, status, and community rating score.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'The anime title or keyword to search for (e.g. "Frieren", "Steins;Gate", "Attack on Titan").',
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
      try {
        const result = await this.searchProvider(args.title);
        if (result) return result;
      } catch {
        return {
          title: args.title,
          synopsis: 'The anime database is currently unreachable. Try again later.',
        };
      }
      return {
        title: args.title,
        synopsis: `No anime matching "${args.title}" was found.`,
      };
    }

    return {
      title: args.title,
      synopsis: 'Anime search is not available right now.',
    };
  }
}
