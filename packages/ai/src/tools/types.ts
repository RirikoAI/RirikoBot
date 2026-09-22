import type { z } from 'zod';
import type { ToolDefinition } from '../types/index.js';

export interface ToolExecutionContext {
  userId: string;
  guildId?: string | undefined;
  channelId?: string | undefined;
  userTimezone?: string | undefined;
  guildTimezone?: string | undefined;
  userPermissions?: bigint | undefined;
  botPermissions?: bigint | undefined;
  isModuleEnabled?: ((moduleName: string) => boolean) | undefined;
  getBalance?:
    | ((userId: string) => Promise<{ wallet: number; bank: number; netWorth: number } | null>)
    | undefined;
  playMusic?:
    | ((query: string) => Promise<{
        success: boolean;
        message: string;
        trackTitle?: string | undefined;
        trackUrl?: string | undefined;
        position?: number | undefined;
      }>)
    | undefined;
}

export interface SafeTool<TInput = unknown, TOutput = unknown> {
  readonly definition: ToolDefinition;
  readonly schema: z.ZodSchema<TInput>;
  readonly requiredPermission?: bigint | undefined;
  readonly moduleName?: string | undefined;
  execute(args: TInput, context: ToolExecutionContext): Promise<TOutput>;
}

export interface TimeToolResult {
  iso: string;
  formatted: string;
  timezone: string;
  utcOffset: string;
}

export interface CoinFlipResult {
  result: 'heads' | 'tails';
  won?: boolean | undefined;
  message: string;
}

export interface AnimeSearchResult {
  title: string;
  synopsis: string;
  score?: number | undefined;
  episodes?: number | undefined;
  status?: string | undefined;
  url?: string | undefined;
}

export interface ReminderCreateResult {
  scheduled: boolean;
  message: string;
  triggerTimeIso: string;
  relativeDescription: string;
  /** Why the reminder was not scheduled (only when `scheduled` is false). */
  error?: string | undefined;
}
