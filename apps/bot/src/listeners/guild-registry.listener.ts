import { AuditLogEvent, Events, type Client, type Guild } from 'discord.js';
import type { InviteSource } from '@ririko/database';
import type { BotServices } from '../services.js';

type Services = Pick<BotServices, 'guildRepo'>;
type Log = Pick<Console, 'error'>;

/** Missing Access and Missing Permissions: the bot may not read the audit log or integrations. */
const LOOKUP_DENIED = new Set([50001, 50013]);

const errorCode = (error: unknown): number | undefined =>
  typeof error === 'object' && error !== null && 'code' in error ? Number(error.code) : undefined;

/** Who added the bot, and where that was learned. */
export interface BotInviter {
  userId: string;
  via: InviteSource;
}

/** Reads one source; a missing permission is normal and silent, any other error is logged. */
async function attempt(
  guild: Guild,
  what: string,
  log: Log,
  read: () => Promise<string | null>,
): Promise<string | null> {
  try {
    return await read();
  } catch (error) {
    if (!LOOKUP_DENIED.has(errorCode(error) ?? 0)) {
      log.error(`[GuildRegistry] Could not read the ${what} of guild ${guild.id}:`, error);
    }
    return null;
  }
}

/**
 * Who added the bot to `guild`, or null. Discord does not tell a bot who invited it. The audit log
 * has a `BotAdd` entry for 45 days, and only with View Audit Log; when it names no one, the
 * integrations list (Manage Server) names the user who added the bot's integration. A missing
 * permission, an expired entry or any API error gives null.
 */
export async function findBotInviter(
  guild: Guild,
  botId: string,
  log: Log = console,
): Promise<BotInviter | null> {
  const fromAuditLog = await attempt(guild, 'audit log', log, async () => {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 10 });
    return logs.entries.find((candidate) => candidate.targetId === botId)?.executorId ?? null;
  });
  if (fromAuditLog) return { userId: fromAuditLog, via: 'audit_log' };

  const fromIntegration = await attempt(guild, 'integrations', log, async () => {
    const integrations = await guild.fetchIntegrations();
    for (const integration of integrations.values()) {
      if (integration.application?.id === botId) return integration.user?.id ?? null;
    }
    return null;
  });
  return fromIntegration ? { userId: fromIntegration, via: 'integration' } : null;
}

/**
 * Keeps the `guilds` table current (TASK-1831): every server the bot is in, its owner, who added
 * it, and which servers it has left. Database and Discord errors are logged and never reach the
 * gateway; the bot works without the table.
 */
export function registerGuildRegistryListener(
  client: Client,
  services: Services,
  log: Log = console,
): void {
  const { guildRepo } = services;

  const record = (guild: Guild) =>
    guildRepo.upsert({
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconURL(),
      ownerId: guild.ownerId,
      joinedAt: guild.joinedAt ?? new Date(),
    });

  /** Looks the inviter up and stores it; does nothing when no source names one. */
  const recordInviter = async (guild: Guild) => {
    const botId = client.user?.id;
    if (!botId) return;
    const inviter = await findBotInviter(guild, botId, log);
    if (inviter) await guildRepo.setInviterIfMissing(guild.id, inviter.userId, inviter.via);
  };

  const syncAll = async () => {
    const known = [...client.guilds.cache.values()];
    for (const guild of known) {
      // A guild that is down at startup has no name or owner yet; its row stays as it is.
      if (!guild.available) continue;
      try {
        await record(guild);
      } catch (error) {
        log.error(`[GuildRegistry] Could not record guild ${guild.id}:`, error);
      }
    }
    await guildRepo.markInactiveExcept(known.map((guild) => guild.id));

    // One guild at a time, so the audit log endpoint is never hit in a burst.
    for (const id of await guildRepo.listActiveIdsWithoutInviter()) {
      const guild = client.guilds.cache.get(id);
      if (!guild?.available) continue;
      try {
        await recordInviter(guild);
      } catch (error) {
        log.error(`[GuildRegistry] Could not store the inviter of guild ${id}:`, error);
      }
    }
  };

  client.on(Events.ClientReady, () => {
    syncAll().catch((error: unknown) => {
      log.error('[GuildRegistry] Could not sync the servers on ready:', error);
    });
  });

  client.on(Events.GuildCreate, async (guild: Guild) => {
    try {
      await record(guild);
      // A guild that comes back after an outage already has its inviter.
      const row = await guildRepo.findById(guild.id);
      if (!row?.invitedById) await recordInviter(guild);
    } catch (error) {
      log.error(`[GuildRegistry] Could not record new guild ${guild.id}:`, error);
    }
  });

  client.on(Events.GuildUpdate, async (_old: Guild, guild: Guild) => {
    try {
      await record(guild);
    } catch (error) {
      log.error(`[GuildRegistry] Could not update guild ${guild.id}:`, error);
    }
  });

  client.on(Events.GuildDelete, async (guild: Guild) => {
    // An outage also fires this event, with the guild marked unavailable; the bot is still in it.
    if (guild.available === false) return;
    try {
      await guildRepo.markInactive([guild.id]);
    } catch (error) {
      log.error(`[GuildRegistry] Could not mark guild ${guild.id} inactive:`, error);
    }
  });
}
