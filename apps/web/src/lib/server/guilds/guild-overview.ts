import 'server-only';
import type { BotActivityRepository, BotStatus, CommandUsageDaily } from '@ririko/database';
import { BOT_STATUS_ID, BOT_STATUS_STALE_MS, utcDay } from '@ririko/services/activity';
import type { GuildCounts, GuildResourceDirectory } from './guild-resources';

/** Days shown in the command usage chart, today included. */
export const USAGE_DAYS = 30;
const TOP_COMMANDS = 8;
const DAY_MS = 86_400_000;

export interface CommandUsageSummary {
  /** One entry per UTC day, oldest first, days without commands included as 0. */
  days: { day: string; count: number }[];
  /** Most used commands over the period, most used first. */
  top: { commandName: string; count: number }[];
  total: number;
}

export interface BotStatusView {
  /** False when the bot has not written its status for `BOT_STATUS_STALE_MS`. */
  online: boolean;
  pingMs: number | null;
  version: string;
  startedAt: string;
  updatedAt: string;
}

export interface VoiceChannelView {
  channelId: string;
  name: string;
  members: number;
}

export interface GuildOverview {
  /** Null when Discord could not be reached. */
  counts: GuildCounts | null;
  /** Null when the bot is offline, because its last report may be out of date. */
  voice: VoiceChannelView[] | null;
  /** Null when the bot has never reported. */
  bot: BotStatusView | null;
  usage: CommandUsageSummary;
}

export function summarizeCommandUsage(
  rows: Pick<CommandUsageDaily, 'day' | 'commandName' | 'count'>[],
  now: number,
): CommandUsageSummary {
  const perDay = new Map<string, number>();
  const perCommand = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    perDay.set(row.day, (perDay.get(row.day) ?? 0) + row.count);
    perCommand.set(row.commandName, (perCommand.get(row.commandName) ?? 0) + row.count);
    total += row.count;
  }

  const days = Array.from({ length: USAGE_DAYS }, (_, index) => {
    const day = utcDay(now - (USAGE_DAYS - 1 - index) * DAY_MS);
    return { day, count: perDay.get(day) ?? 0 };
  });
  const top = [...perCommand]
    .map(([commandName, count]) => ({ commandName, count }))
    .sort((a, b) => b.count - a.count || a.commandName.localeCompare(b.commandName))
    .slice(0, TOP_COMMANDS);
  return { days, top, total };
}

export function botStatusView(status: BotStatus | null, now: number): BotStatusView | null {
  if (!status) return null;
  return {
    online: now - status.updatedAt.getTime() < BOT_STATUS_STALE_MS,
    pingMs: status.gatewayPingMs,
    version: status.version,
    startedAt: status.startedAt.toISOString(),
    updatedAt: status.updatedAt.toISOString(),
  };
}

/** Everything the Overview tab shows. Callers must have passed `requireGuildAccess(guildId)`. */
export async function loadGuildOverview(
  deps: {
    resources: Pick<GuildResourceDirectory, 'memberCounts' | 'channelNames'>;
    activity: Pick<BotActivityRepository, 'getBotStatus' | 'getVoiceActivity' | 'listCommandUsage'>;
  },
  guildId: string,
  now: number = Date.now(),
): Promise<GuildOverview> {
  const [counts, status, voiceActivity, usageRows] = await Promise.all([
    deps.resources.memberCounts(guildId).catch((error: unknown) => {
      console.error(`[Overview] Could not read member counts for guild ${guildId}:`, error);
      return null;
    }),
    deps.activity.getBotStatus(BOT_STATUS_ID),
    deps.activity.getVoiceActivity(guildId),
    deps.activity.listCommandUsage(guildId, utcDay(now - (USAGE_DAYS - 1) * DAY_MS)),
  ]);

  const bot = botStatusView(status, now);
  let voice: VoiceChannelView[] | null = null;
  if (bot?.online) {
    const channels = voiceActivity?.channels ?? [];
    const names =
      channels.length > 0 ? await deps.resources.channelNames(guildId) : new Map<string, string>();
    voice = channels
      .map(({ channelId, members }) => ({
        channelId,
        name: names.get(channelId) ?? 'Unknown channel',
        members,
      }))
      .sort((a, b) => b.members - a.members || a.name.localeCompare(b.name));
  }

  return { counts, voice, bot, usage: summarizeCommandUsage(usageRows, now) };
}
