import 'server-only';
import type { AuditLog, AuditLogCursor, AuditLogRepository } from '@ririko/database';
import type { GuildResourceDirectory } from './guild-resources';
import type { UserDirectory, UserSummary } from './user-directory';

export const AUDIT_PAGE_SIZE = 25;
const SNOWFLAKE = /^\d{17,20}$/;
const CURSOR = /^(\d{1,15})_([\w-]{1,64})$/;

/** Cursor as `<created at ms>_<id>`, the form used in the `before` query parameter. */
export function encodeAuditCursor(entry: { createdAt: Date; id: string }): string {
  return `${entry.createdAt.getTime()}_${entry.id}`;
}

export function parseAuditCursor(value: string | string[] | undefined): AuditLogCursor | undefined {
  const match = typeof value === 'string' ? CURSOR.exec(value) : null;
  return match ? { createdAt: new Date(Number(match[1])), id: match[2]! } : undefined;
}

export interface AuditChange {
  field: string;
  before: string;
  after: string;
}

export interface AuditEntry {
  id: string;
  /** Snowflake, or a marker such as `cli:<os user>` for CLI changes. */
  actorUserId: string;
  source: string | null;
  summary: string;
  changes: AuditChange[];
  createdAt: string;
}

export interface AuditLogPage {
  entries: AuditEntry[];
  nextBefore: string | null;
  users: Map<string, UserSummary>;
}

const MODULE_LABELS: Record<string, string> = {
  general: 'General',
  moderation: 'Moderation',
  automod: 'AutoMod',
  logging: 'Logging',
  commands: 'Command',
  autoroles: 'Auto Roles',
  autovoice: 'Auto Voice',
};

/** `guild_config.automod.update` as `AutoMod settings changed`; other actions as they are. */
export function describeAuditAction(action: string): string {
  const match = /^guild_config\.([\w-]+)\.update$/.exec(action);
  if (!match) return action;
  const name = match[1]!;
  return `${MODULE_LABELS[name] ?? name} settings changed`;
}

/** `logChannelId` as `Log channel ID`. */
export function fieldLabel(field: string): string {
  const words = field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => (word === 'Id' ? 'ID' : word === 'Ids' ? 'IDs' : word.toLowerCase()));
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A stored value as text: IDs of known channels and roles become `#name` and `@name`, lists
 * are comma separated, and objects (such as escalation steps) are JSON.
 */
export function formatAuditValue(value: unknown, names: ReadonlyMap<string, string>): string {
  if (value === null || value === undefined || value === '') return '(none)';
  if (typeof value === 'string') return SNOWFLAKE.test(value) ? (names.get(value) ?? value) : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.length === 0
      ? '(none)'
      : value.map((item) => formatAuditValue(item, names)).join(', ');
  }
  return JSON.stringify(value);
}

function changesOf(
  details: AuditLog['details'],
): { field: string; before: unknown; after: unknown }[] {
  const changes = details?.changes;
  if (!Array.isArray(changes)) return [];
  return changes.filter(
    (change): change is { field: string; before: unknown; after: unknown } =>
      typeof change === 'object' && change !== null && typeof change.field === 'string',
  );
}

interface AuditLogDeps {
  audit: Pick<AuditLogRepository, 'listByGuild'>;
  users: Pick<UserDirectory, 'lookup'>;
  resources: Pick<GuildResourceDirectory, 'channelNames' | 'memberRoles'>;
}

/**
 * One page of a guild's dashboard and CLI changes. IP addresses and user agents are not
 * returned: every manager of the guild can open this page, and those belong to the actor.
 * Callers must have passed `requireGuildAccess(guildId)`.
 */
export async function loadAuditLog(
  deps: AuditLogDeps,
  guildId: string,
  before: AuditLogCursor | undefined,
): Promise<AuditLogPage> {
  const rows = await deps.audit.listByGuild(guildId, { limit: AUDIT_PAGE_SIZE + 1, before });
  const page = rows.slice(0, AUDIT_PAGE_SIZE);

  const [users, channels, roles] = await Promise.all([
    deps.users.lookup(page.map((row) => row.actorUserId)),
    deps.resources.channelNames(guildId).catch(() => new Map<string, string>()),
    deps.resources.memberRoles(guildId).catch(() => []),
  ]);
  const names = new Map<string, string>([
    ...[...channels].map(([id, name]) => [id, `#${name}`] as const),
    ...roles.map((role) => [role.id, `@${role.name}`] as const),
  ]);

  return {
    entries: page.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      source: typeof row.details?.source === 'string' ? row.details.source : null,
      summary: describeAuditAction(row.action),
      changes: changesOf(row.details).map((change) => ({
        field: fieldLabel(change.field),
        before: formatAuditValue(change.before, names),
        after: formatAuditValue(change.after, names),
      })),
      createdAt: row.createdAt.toISOString(),
    })),
    nextBefore: rows.length > AUDIT_PAGE_SIZE ? encodeAuditCursor(page.at(-1)!) : null,
    users,
  };
}
