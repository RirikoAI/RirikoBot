import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';

import type { DatabaseClient } from '../client/types.js';
import type {
  BotStatus,
  CommandUsageDaily,
  GuildVoiceActivity,
  VoiceChannelActivity,
} from '../schema/types/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';

/**
 * Live bot data the dashboard reads (TASK-1131): daily command usage, the bot status heartbeat
 * and per-guild voice activity. The bot is the only writer.
 */
export class BotActivityRepository {
  constructor(protected readonly client: DatabaseClient) {}

  /** Adds each row's `count` to the stored count for its guild, day and command. */
  async addCommandUsage(rows: CommandUsageDaily[]): Promise<void> {
    if (rows.length === 0) return;
    const client = this.client;
    if (client.dialect === 'sqlite') {
      const table = sqliteSchema.commandUsageDaily;
      await client.db
        .insert(table)
        .values(rows)
        .onConflictDoUpdate({
          target: [table.guildId, table.day, table.commandName],
          set: { count: sql`${table.count} + excluded.count` },
        });
    } else {
      const table = pgSchema.commandUsageDaily;
      await client.db
        .insert(table)
        .values(rows)
        .onConflictDoUpdate({
          target: [table.guildId, table.day, table.commandName],
          set: { count: sql`${table.count} + excluded.count` },
        });
    }
  }

  /** A guild's usage rows from `fromDay` (inclusive, `YYYY-MM-DD`), oldest day first. */
  async listCommandUsage(guildId: string, fromDay: string): Promise<CommandUsageDaily[]> {
    const client = this.client;
    if (client.dialect === 'sqlite') {
      const table = sqliteSchema.commandUsageDaily;
      return client.db
        .select()
        .from(table)
        .where(and(eq(table.guildId, guildId), gte(table.day, fromDay)))
        .orderBy(asc(table.day), asc(table.commandName));
    }
    const table = pgSchema.commandUsageDaily;
    return client.db
      .select()
      .from(table)
      .where(and(eq(table.guildId, guildId), gte(table.day, fromDay)))
      .orderBy(asc(table.day), asc(table.commandName));
  }

  /** Deletes usage rows for days before `day` (`YYYY-MM-DD`). */
  async deleteCommandUsageBefore(day: string): Promise<void> {
    const client = this.client;
    if (client.dialect === 'sqlite') {
      await client.db
        .delete(sqliteSchema.commandUsageDaily)
        .where(lt(sqliteSchema.commandUsageDaily.day, day));
    } else {
      await client.db
        .delete(pgSchema.commandUsageDaily)
        .where(lt(pgSchema.commandUsageDaily.day, day));
    }
  }

  async saveBotStatus(status: BotStatus): Promise<void> {
    const client = this.client;
    const { id, ...fields } = status;
    if (client.dialect === 'sqlite') {
      await client.db
        .insert(sqliteSchema.botStatus)
        .values(status)
        .onConflictDoUpdate({ target: sqliteSchema.botStatus.id, set: fields });
    } else {
      await client.db
        .insert(pgSchema.botStatus)
        .values({ id, ...fields })
        .onConflictDoUpdate({ target: pgSchema.botStatus.id, set: fields });
    }
  }

  async getBotStatus(id: string): Promise<BotStatus | null> {
    const client = this.client;
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db
            .select()
            .from(sqliteSchema.botStatus)
            .where(eq(sqliteSchema.botStatus.id, id))
        : await client.db.select().from(pgSchema.botStatus).where(eq(pgSchema.botStatus.id, id));
    return row ?? null;
  }

  /** Stores a guild's active voice channels; an empty list removes the guild's row. */
  async setVoiceActivity(
    guildId: string,
    channels: VoiceChannelActivity[],
    now: Date,
  ): Promise<void> {
    const client = this.client;
    if (channels.length === 0) {
      if (client.dialect === 'sqlite') {
        await client.db
          .delete(sqliteSchema.guildVoiceActivity)
          .where(eq(sqliteSchema.guildVoiceActivity.guildId, guildId));
      } else {
        await client.db
          .delete(pgSchema.guildVoiceActivity)
          .where(eq(pgSchema.guildVoiceActivity.guildId, guildId));
      }
      return;
    }
    const set = { channels, updatedAt: now };
    if (client.dialect === 'sqlite') {
      await client.db
        .insert(sqliteSchema.guildVoiceActivity)
        .values({ guildId, ...set })
        .onConflictDoUpdate({ target: sqliteSchema.guildVoiceActivity.guildId, set });
    } else {
      await client.db
        .insert(pgSchema.guildVoiceActivity)
        .values({ guildId, ...set })
        .onConflictDoUpdate({ target: pgSchema.guildVoiceActivity.guildId, set });
    }
  }

  async getVoiceActivity(guildId: string): Promise<GuildVoiceActivity | null> {
    const client = this.client;
    const [row] =
      client.dialect === 'sqlite'
        ? await client.db
            .select()
            .from(sqliteSchema.guildVoiceActivity)
            .where(eq(sqliteSchema.guildVoiceActivity.guildId, guildId))
        : await client.db
            .select()
            .from(pgSchema.guildVoiceActivity)
            .where(eq(pgSchema.guildVoiceActivity.guildId, guildId));
    return row ?? null;
  }

  /** Removes every guild's voice activity, for a bot that starts without knowing the old rows. */
  async clearVoiceActivity(): Promise<void> {
    const client = this.client;
    if (client.dialect === 'sqlite') {
      await client.db.delete(sqliteSchema.guildVoiceActivity);
    } else {
      await client.db.delete(pgSchema.guildVoiceActivity);
    }
  }
}
