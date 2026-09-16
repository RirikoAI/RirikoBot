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
}

export class MusicPlayTool implements SafeTool<MusicPlayArgs, MusicPlayResult> {
  readonly definition = {
    name: 'music.play',
    description: 'Queues and plays audio from YouTube, Spotify, SoundCloud, or Deezer in the current voice channel.',
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

  async execute(args: MusicPlayArgs, context: ToolExecutionContext): Promise<MusicPlayResult> {
    if (!context.guildId) {
      return {
        query: args.query,
        action: 'error',
        message: 'Music playback is only available in Discord servers with a voice channel.',
      };
    }

    return {
      query: args.query,
      action: 'queued',
      message: `Searching and queuing "${args.query}" into the music player.`,
    };
  }
}
