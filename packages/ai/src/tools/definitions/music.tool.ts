import { z } from 'zod';
import type { SafeTool, ToolExecutionContext } from '../types.js';

export const MusicPlayArgsSchema = z.object({
  query: z.string().min(1, 'Music search query or URL must not be empty').max(300),
});

export type MusicPlayArgs = z.infer<typeof MusicPlayArgsSchema>;

export interface MusicPlayResult {
  query: string;
  action: 'queued' | 'error';
  message: string;
  trackTitle?: string | undefined;
  trackUrl?: string | undefined;
  position?: number | undefined;
}

export type MusicPlayResolver = (
  query: string,
  context: ToolExecutionContext,
) => Promise<{
  success: boolean;
  message: string;
  trackTitle?: string | undefined;
  trackUrl?: string | undefined;
  position?: number | undefined;
} | null>;

export class MusicPlayTool implements SafeTool<MusicPlayArgs, MusicPlayResult> {
  readonly definition = {
    name: 'music.play',
    description:
      'Queues and plays audio from YouTube, Spotify, SoundCloud, or Deezer in the current voice channel.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search keywords or URL of the track/playlist to play.',
        },
      },
      required: ['query'],
    },
  };

  readonly schema = MusicPlayArgsSchema;
  readonly moduleName = 'music';
  // PermissionFlagsBits.Connect (1n << 20n) | PermissionFlagsBits.Speak (1n << 21n) = 3145728n
  readonly requiredPermission = 3145728n;

  constructor(private readonly playResolver?: MusicPlayResolver) {}

  async execute(args: MusicPlayArgs, context: ToolExecutionContext): Promise<MusicPlayResult> {
    if (!context.guildId) {
      return {
        query: args.query,
        action: 'error',
        message: 'Music playback is only available in Discord servers with a voice channel.',
      };
    }

    let playRes: {
      success: boolean;
      message: string;
      trackTitle?: string | undefined;
      trackUrl?: string | undefined;
      position?: number | undefined;
    } | null = null;

    if (context.playMusic) {
      playRes = await context.playMusic(args.query).catch((err) => ({
        success: false,
        message: `Failed to play track: ${err instanceof Error ? err.message : String(err)}`,
      }));
    } else if (this.playResolver) {
      playRes = await this.playResolver(args.query, context).catch((err) => ({
        success: false,
        message: `Failed to play track: ${err instanceof Error ? err.message : String(err)}`,
      }));
    }

    if (playRes) {
      return {
        query: args.query,
        action: playRes.success ? 'queued' : 'error',
        message: playRes.message,
        ...(playRes.trackTitle !== undefined && { trackTitle: playRes.trackTitle }),
        ...(playRes.trackUrl !== undefined && { trackUrl: playRes.trackUrl }),
        ...(playRes.position !== undefined && { position: playRes.position }),
      };
    }

    return {
      query: args.query,
      action: 'queued',
      message: `Searching and queuing "${args.query}" into the music player.`,
    };
  }
}
