import 'server-only';
import type {
  BotActivityRepository,
  CommandUsageDaily,
  Guild,
  GuildRepository,
  InviteSource,
} from '@ririko/database';
import { utcDay } from '@ririko/services/activity';
import {
  summarizeCommandUsage,
  USAGE_DAYS,
  type CommandUsageSummary,
} from '../guilds/guild-overview';
import type { UserDirectory, UserSummary } from '../guilds/user-directory';

const DAY_MS = 86_400_000;
const INVITE_SOURCES: readonly string[] = [
  'oauth',
  'audit_log',
  'integration',
] satisfies InviteSource[];

function inviteSource(value: string | null): InviteSource | null {
  return value !== null && INVITE_SOURCES.includes(value) ? (value as InviteSource) : null;
}

/** One server as the owner console lists it, with its command usage over the last 30 UTC days. */
export interface ServerRow {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  /** The member who added the bot, or null when no source (invite link, audit log, integrations) says. */
  inviterId: string | null;
  /** How the inviter was learned, or null with no inviter. */
  inviterVia: InviteSource | null;
  /** ISO timestamp of when the bot joined. */
  joinedAt: string;
  /** Commands run in the period. */
  total: number;
  busiestDay: { day: string; count: number } | null;
  topCommand: { commandName: string; count: number } | null;
}

export interface ServerList {
  /** Servers the bot is in, most commands first. */
  active: ServerRow[];
  /** Servers the bot has left, most commands first. */
  inactive: ServerRow[];
}

type UsageRow = Pick<CommandUsageDaily, 'guildId' | 'day' | 'commandName' | 'count'>;

function summarizeOne(guild: Guild, rows: readonly UsageRow[] | undefined): ServerRow {
  const perDay = new Map<string, number>();
  const perCommand = new Map<string, number>();
  let total = 0;
  for (const row of rows ?? []) {
    perDay.set(row.day, (perDay.get(row.day) ?? 0) + row.count);
    perCommand.set(row.commandName, (perCommand.get(row.commandName) ?? 0) + row.count);
    total += row.count;
  }
  // Highest count first; the earlier day and the alphabetically first command win a tie.
  const [busiest] = [...perDay].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [top] = [...perCommand].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guild.iconUrl,
    ownerId: guild.ownerId,
    inviterId: guild.invitedById,
    inviterVia: guild.invitedById ? inviteSource(guild.invitedVia) : null,
    joinedAt: guild.joinedAt.toISOString(),
    total,
    busiestDay: busiest ? { day: busiest[0], count: busiest[1] } : null,
    topCommand: top ? { commandName: top[0], count: top[1] } : null,
  };
}

const byTotal = (a: ServerRow, b: ServerRow) =>
  b.total - a.total || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/**
 * One row per server with its usage totals, split into servers the bot is in and servers it has
 * left. `usageRows` may hold any number of days; the caller reads only the period it wants.
 */
export function summarizeServers(
  guilds: readonly Guild[],
  usageRows: readonly UsageRow[],
): ServerList {
  const perGuild = new Map<string, UsageRow[]>();
  for (const row of usageRows) {
    const rows = perGuild.get(row.guildId);
    if (rows) rows.push(row);
    else perGuild.set(row.guildId, [row]);
  }
  const rows = guilds.map((guild) => ({
    isActive: guild.isActive,
    row: summarizeOne(guild, perGuild.get(guild.id)),
  }));
  return {
    active: rows
      .filter((r) => r.isActive)
      .map((r) => r.row)
      .sort(byTotal),
    inactive: rows
      .filter((r) => !r.isActive)
      .map((r) => r.row)
      .sort(byTotal),
  };
}

export interface ServerUsageView extends ServerList {
  /** The server chosen with `?guild=`, or null for all servers. */
  selected: ServerRow | null;
  /** Chart data and most used commands for the selected server, or for all servers. */
  usage: CommandUsageSummary;
  /** Username and display name of the owner and inviter IDs; IDs Discord does not know are missing. */
  users: Map<string, UserSummary>;
}

/**
 * Everything the owner console Servers tab shows. `selectedId` is raw user input: it only
 * selects a server when it is one of the listed servers. Callers must have passed `requireOwner`.
 */
export async function loadServerUsage(
  deps: {
    guilds: Pick<GuildRepository, 'listAll'>;
    activity: Pick<BotActivityRepository, 'listAllCommandUsage'>;
    users: Pick<UserDirectory, 'lookup'>;
  },
  selectedId: string | undefined,
  now: number = Date.now(),
): Promise<ServerUsageView> {
  const [guilds, usageRows] = await Promise.all([
    deps.guilds.listAll(),
    deps.activity.listAllCommandUsage(utcDay(now - (USAGE_DAYS - 1) * DAY_MS)),
  ]);
  const list = summarizeServers(guilds, usageRows);
  const selected =
    selectedId === undefined
      ? null
      : ([...list.active, ...list.inactive].find((server) => server.id === selectedId) ?? null);
  const users = await deps.users.lookup(
    [...list.active, ...list.inactive].flatMap((server) =>
      server.inviterId ? [server.ownerId, server.inviterId] : [server.ownerId],
    ),
  );
  return {
    ...list,
    selected,
    usage: summarizeCommandUsage(
      selected ? usageRows.filter((row) => row.guildId === selected.id) : usageRows,
      now,
    ),
    users,
  };
}
