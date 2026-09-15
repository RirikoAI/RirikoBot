import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';
import type { InspectionSummary } from './types.js';
import { DatabaseError } from '@ririko/core';

export class LegacySqliteInspector {
  private db: Database.Database | null = null;

  constructor(private readonly dbPath: string) {}

  /**
   * Opens the legacy SQLite database in strict READONLY mode.
   * Enforces the Zero Legacy Mutation invariant.
   */
  open(): Database.Database {
    if (!this.db) {
      try {
        this.db = new (DatabaseConstructor as unknown as typeof Database)(this.dbPath, {
          readonly: true,
          fileMustExist: true,
        });
      } catch (err) {
        throw new DatabaseError(`Failed to open legacy database at ${this.dbPath}`, {
          cause: err instanceof Error ? err : undefined,
        });
      }
    }
    return this.db;
  }

  close(): void {
    if (this.db && this.db.open) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Performs non-destructive inspection of the legacy 1.4.0 database.
   */
  inspect(): InspectionSummary {
    const db = this.open();

    // Query existing tables
    const tableRows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];

    const tables: Record<string, number> = {};
    const anomalies: string[] = [];

    const expectedLegacyTables = [
      'user',
      'guild',
      'guild_config',
      'configuration',
      'user_note',
      'voice_channel',
      'music_channel',
      'playlist',
      'track',
      'stream_subscription',
      'stream_notification',
      'twitch_streamer',
      'reaction_role',
      'reminder',
      'free_game_notification',
      'item',
      'item_category',
    ];

    for (const tableName of expectedLegacyTables) {
      // Check for exact or plural match
      const matched = tableRows.find(
        (r) => r.name.toLowerCase() === tableName || r.name.toLowerCase() === `${tableName}s`,
      );

      if (matched) {
        try {
          const countRow = db.prepare(`SELECT count(*) as count FROM "${matched.name}"`).get() as {
            count: number;
          };
          tables[matched.name] = countRow.count;
        } catch {
          tables[matched.name] = 0;
        }
      } else {
        tables[tableName] = 0;
      }
    }

    let totalCoins = 0n;
    let totalKarma = 0n;
    let totalUsers = 0;
    let totalGuilds = 0;

    // Inspect user table if present
    const userTableName = tableRows.find((r) => r.name.toLowerCase() === 'user')?.name;
    if (userTableName) {
      try {
        const userStats = db
          .prepare(
            `SELECT count(*) as totalUsers, COALESCE(SUM(coins), 0) as totalCoins, COALESCE(SUM(karma), 0) as totalKarma FROM "${userTableName}"`,
          )
          .get() as {
          totalUsers: number;
          totalCoins: number | bigint;
          totalKarma: number | bigint;
        };

        totalUsers = userStats.totalUsers;
        totalCoins = BigInt(userStats.totalCoins ?? 0);
        totalKarma = BigInt(userStats.totalKarma ?? 0);

        // Check for anomalies
        const negativeCoins = db
          .prepare(`SELECT count(*) as c FROM "${userTableName}" WHERE coins < 0`)
          .get() as { c: number };
        if (negativeCoins.c > 0) {
          anomalies.push(`Found ${negativeCoins.c} users with negative coin balances.`);
        }

        const missingIds = db
          .prepare(`SELECT count(*) as c FROM "${userTableName}" WHERE id IS NULL OR id = ''`)
          .get() as { c: number };
        if (missingIds.c > 0) {
          anomalies.push(`Found ${missingIds.c} user records with missing or empty ID.`);
        }
      } catch (err) {
        anomalies.push(`Error calculating user statistics: ${(err as Error).message}`);
      }
    }

    // Inspect guild table if present
    const guildTableName = tableRows.find((r) => r.name.toLowerCase() === 'guild')?.name;
    if (guildTableName) {
      try {
        const guildStats = db
          .prepare(`SELECT count(*) as totalGuilds FROM "${guildTableName}"`)
          .get() as { totalGuilds: number };
        totalGuilds = guildStats.totalGuilds;
      } catch (err) {
        anomalies.push(`Error counting guilds: ${(err as Error).message}`);
      }
    }

    return {
      tables,
      totalCoins,
      totalKarma,
      totalUsers,
      totalGuilds,
      anomalies,
    };
  }
}
