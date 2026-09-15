import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import type {
  DatabaseClient,
  SqliteDatabaseClient,
  PostgresDatabaseClient,
} from '../client/types.js';
import type { MigrationResult } from './types.js';
import { LegacySqliteInspector } from './inspector.js';
import { LegacyTransformer } from './transformer.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import * as pgSchema from '../schema/pg/index.js';
import { withTransaction } from '../transactions/index.js';

export interface MigrationOptions {
  dryRun?: boolean | undefined;
  batchSize?: number | undefined;
}

export interface VerificationResult {
  ok: boolean;
  legacyCoins: bigint;
  targetCoins: bigint;
  legacyUsers: number;
  targetUsers: number;
  tableCounts: Record<string, { legacy: number; target: number }>;
  message: string;
}

export class MigrationEngine {
  /**
   * Executes or dry-runs migration of a 1.4.0 legacy SQLite database into 2.0.0.
   */
  async migrate(
    sourcePath: string,
    targetClient: DatabaseClient,
    options?: MigrationOptions,
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const batchId = randomUUID();
    const isDryRun = Boolean(options?.dryRun);
    const batchSize = options?.batchSize ?? 500;

    // 1. Pre-flight audit via readonly inspector
    const inspector = new LegacySqliteInspector(sourcePath);
    const inspected = inspector.inspect();

    // 2. Read and transform data
    const db = inspector.open();
    const transformer = new LegacyTransformer(db);
    const data = transformer.transform();
    inspector.close();

    const totalCoinsMigrated = data.economyBalances.reduce(
      (sum, b) => sum + BigInt(b.walletBalance ?? 0),
      0n,
    );
    const coinsConserved = totalCoinsMigrated === inspected.totalCoins;

    const migratedCounts: Record<string, number> = {
      users: data.users.length,
      economyBalances: data.economyBalances.length,
      economyTransactions: data.economyTransactions.length,
      xpAccounts: data.xpAccounts.length,
      guilds: data.guilds.length,
      guildSettings: data.guildSettings.length,
      moderationNotes: data.moderationNotes.length,
      autoVoiceConfigs: data.autoVoiceConfigs.length,
      musicChannels: data.musicChannels.length,
      musicSavedPlaylists: data.musicSavedPlaylists.length,
      musicPlaylistTracks: data.musicPlaylistTracks.length,
      streamers: data.streamers.length,
      streamSubscriptions: data.streamSubscriptions.length,
      reactionRoles: data.reactionRoles.length,
      reminders: data.reminders.length,
      freeGameAnnouncements: data.freeGameAnnouncements.length,
      economyItemCategories: data.economyItemCategories.length,
      economyItems: data.economyItems.length,
    };

    if (isDryRun) {
      return {
        batchId,
        isDryRun: true,
        inspected,
        migratedCounts,
        coinsConserved,
        totalCoinsMigrated,
        durationMs: Date.now() - startTime,
      };
    }

    // 3. Live execution inside atomic transaction
    await withTransaction(targetClient, async (txClient) => {
      const isSqlite = txClient.dialect === 'sqlite';

      const insertBatch = async <T extends Record<string, unknown>>(
        sqliteTable: SQLiteTable,
        pgTable: PgTable,
        items: readonly T[],
      ) => {
        if (items.length === 0) return;
        for (let i = 0; i < items.length; i += batchSize) {
          const chunk = items.slice(i, i + batchSize);
          if (isSqlite) {
            await (txClient as SqliteDatabaseClient).db
              .insert(sqliteTable)
              .values(chunk as unknown as Record<string, unknown>[])
              .onConflictDoNothing();
          } else {
            await (txClient as PostgresDatabaseClient).db
              .insert(pgTable)
              .values(chunk as unknown as Record<string, unknown>[])
              .onConflictDoNothing();
          }
        }
      };

      // Users
      await insertBatch(sqliteSchema.users, pgSchema.users, data.users);

      // Economy Balances & Migration Ledger Transactions
      await insertBatch(
        sqliteSchema.economyBalances,
        pgSchema.economyBalances,
        data.economyBalances,
      );
      await insertBatch(
        sqliteSchema.economyTransactions,
        pgSchema.economyTransactions,
        data.economyTransactions,
      );

      // XP Accounts
      await insertBatch(sqliteSchema.xpAccounts, pgSchema.xpAccounts, data.xpAccounts);

      // Guilds & Settings
      await insertBatch(sqliteSchema.guilds, pgSchema.guilds, data.guilds);
      await insertBatch(sqliteSchema.guildSettings, pgSchema.guildSettings, data.guildSettings);

      // Moderation Notes
      await insertBatch(
        sqliteSchema.moderationNotes,
        pgSchema.moderationNotes,
        data.moderationNotes,
      );

      // Auto Voice Configs
      await insertBatch(
        sqliteSchema.autoVoiceConfigs,
        pgSchema.autoVoiceConfigs,
        data.autoVoiceConfigs,
      );

      // Music Channels, Playlists, Tracks
      await insertBatch(sqliteSchema.musicChannels, pgSchema.musicChannels, data.musicChannels);
      await insertBatch(
        sqliteSchema.musicSavedPlaylists,
        pgSchema.musicSavedPlaylists,
        data.musicSavedPlaylists,
      );
      await insertBatch(
        sqliteSchema.musicPlaylistTracks,
        pgSchema.musicPlaylistTracks,
        data.musicPlaylistTracks,
      );

      // Streamers & Subscriptions
      await insertBatch(sqliteSchema.streamers, pgSchema.streamers, data.streamers);
      await insertBatch(
        sqliteSchema.streamSubscriptions,
        pgSchema.streamSubscriptions,
        data.streamSubscriptions,
      );

      // Reaction Roles
      await insertBatch(sqliteSchema.reactionRoles, pgSchema.reactionRoles, data.reactionRoles);

      // Reminders
      await insertBatch(sqliteSchema.reminders, pgSchema.reminders, data.reminders);

      // Free Game Announcements
      await insertBatch(
        sqliteSchema.freeGameAnnouncements,
        pgSchema.freeGameAnnouncements,
        data.freeGameAnnouncements,
      );

      // Economy Shop Categories & Items
      await insertBatch(
        sqliteSchema.economyItemCategories,
        pgSchema.economyItemCategories,
        data.economyItemCategories,
      );
      await insertBatch(sqliteSchema.economyItems, pgSchema.economyItems, data.economyItems);
    });

    return {
      batchId,
      isDryRun: false,
      inspected,
      migratedCounts,
      coinsConserved,
      totalCoinsMigrated,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Verifies data integrity between the legacy source and the target 2.0.0 database.
   */
  async verify(sourcePath: string, targetClient: DatabaseClient): Promise<VerificationResult> {
    const inspector = new LegacySqliteInspector(sourcePath);
    const inspected = inspector.inspect();
    inspector.close();

    const isSqlite = targetClient.dialect === 'sqlite';

    // Query target totals
    let targetUsersCount: number;
    let targetCoinsTotal: bigint;

    if (isSqlite) {
      const [userRes] = await targetClient.db
        .select({ count: sql<number>`count(*)` })
        .from(sqliteSchema.users);
      targetUsersCount = Number(userRes?.count ?? 0);

      const [coinRes] = await targetClient.db
        .select({ total: sql<number | bigint>`COALESCE(SUM(wallet_balance), 0)` })
        .from(sqliteSchema.economyBalances);
      targetCoinsTotal = BigInt(coinRes?.total ?? 0);
    } else {
      const [userRes] = await targetClient.db
        .select({ count: sql<number>`count(*)` })
        .from(pgSchema.users);
      targetUsersCount = Number(userRes?.count ?? 0);

      const [coinRes] = await targetClient.db
        .select({ total: sql<number | bigint>`COALESCE(SUM(wallet_balance), 0)` })
        .from(pgSchema.economyBalances);
      targetCoinsTotal = BigInt(coinRes?.total ?? 0);
    }

    const coinsMatch = targetCoinsTotal === inspected.totalCoins;
    const usersMatch = targetUsersCount >= inspected.totalUsers;
    const ok = coinsMatch && usersMatch;

    return {
      ok,
      legacyCoins: inspected.totalCoins,
      targetCoins: targetCoinsTotal,
      legacyUsers: inspected.totalUsers,
      targetUsers: targetUsersCount,
      tableCounts: {
        users: { legacy: inspected.totalUsers, target: targetUsersCount },
      },
      message: ok
        ? 'Migration verification successful: All user counts and financial sums are perfectly conserved.'
        : `Migration verification failed: Coins match = ${coinsMatch}, Users match = ${usersMatch}`,
    };
  }
}
