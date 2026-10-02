import { createHash, type Hash } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { sql, type SQL } from 'drizzle-orm';
import type { DatabaseClient } from '../client/types.js';
import { withTransaction } from '../transactions/index.js';
import { MigrationEngine } from './engine.js';
import type { MigrationResult } from './types.js';

/** One row per 1.4.0 database migrated into this one, keyed by the source's content hash. */
const LEGACY_MIGRATIONS_DDL = `CREATE TABLE IF NOT EXISTS legacy_migrations (
  source_sha256 TEXT PRIMARY KEY NOT NULL, batch_id TEXT NOT NULL, counts TEXT NOT NULL,
  legacy_coins TEXT NOT NULL, migrated_coins TEXT NOT NULL, migrated_at BIGINT NOT NULL
)`;

/** Additive, repeatable: creates `legacy_migrations` when it is missing. */
export async function ensureLegacyMigrationSchema(client: DatabaseClient): Promise<void> {
  await withTransaction(client, async (tx) => {
    if (tx.dialect === 'sqlite') {
      tx.raw.exec(LEGACY_MIGRATIONS_DDL);
      return;
    }
    // PostgreSQL DDL races need a transaction-wide lock even with IF NOT EXISTS.
    await tx.db.execute(sql`SELECT pg_advisory_xact_lock(1704, 1)`);
    await tx.db.execute(sql.raw(LEGACY_MIGRATIONS_DDL)); // Static application DDL, no user input.
  });
}

export interface LegacyUpgradeOptions {
  /** The 1.4.0 SQLite file, usually on a read-only mount. It is only ever read as bytes. */
  sourcePath: string;
  dryRun?: boolean | undefined;
  /** Migrate even though the target already has users or another 1.4.0 database. */
  force?: boolean | undefined;
}

export type LegacyUpgradeResult =
  | { status: 'no-source' }
  | { status: 'already-migrated'; sourceSha256: string; batchId: string; migratedAt: Date }
  | { status: 'target-not-empty'; sourceSha256: string; reason: string }
  | { status: 'dry-run' | 'migrated'; sourceSha256: string; migration: MigrationResult };

/**
 * Migrates a 1.4.0 database into `target` once. The source is copied (with any `-wal` or
 * `-journal` file) to a temporary directory and the migration reads the copy, so the source,
 * typically mounted read-only, is never opened by SQLite or written. The run is recorded in
 * `legacy_migrations` in the same transaction as the migrated rows, keyed by the source's
 * sha256, so running again does nothing. Without `force`, a target that already has users or
 * another migrated 1.4.0 database is left alone. Throws when the coin totals would not match;
 * nothing is written then.
 */
export async function upgradeLegacyDatabase(
  target: DatabaseClient,
  options: LegacyUpgradeOptions,
): Promise<LegacyUpgradeResult> {
  if (!existsSync(options.sourcePath)) return { status: 'no-source' };

  const workDir = mkdtempSync(join(tmpdir(), 'ririko-legacy-'));
  try {
    const copyPath = join(workDir, 'legacy.sqlite');
    const sourceSha256 = await copyLegacyDatabase(options.sourcePath, copyPath);
    settleCopy(copyPath);

    await ensureLegacyMigrationSchema(target);
    const [recorded] = await query<{ batch_id: string; migrated_at: number | string }>(
      target,
      sql`SELECT batch_id, migrated_at FROM legacy_migrations WHERE source_sha256 = ${sourceSha256}`,
    );
    if (recorded) {
      return {
        status: 'already-migrated',
        sourceSha256,
        batchId: recorded.batch_id,
        migratedAt: new Date(Number(recorded.migrated_at)),
      };
    }

    if (!options.force) {
      const reason = await notEmptyReason(target);
      if (reason) return { status: 'target-not-empty', sourceSha256, reason };
    }

    const migration = await new MigrationEngine().migrate(copyPath, target, {
      dryRun: options.dryRun,
      record: (tx, result) => recordMigration(tx, sourceSha256, result),
    });
    return { status: options.dryRun ? 'dry-run' : 'migrated', sourceSha256, migration };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** Copies the database and its `-wal` and `-journal` files; returns the sha256 of the data. */
async function copyLegacyDatabase(sourcePath: string, copyPath: string): Promise<string> {
  const hash = createHash('sha256');
  await copyHashed(sourcePath, copyPath, hash);
  // Committed pages that are still in the write-ahead log are part of the data.
  if (existsSync(`${sourcePath}-wal`)) {
    await copyHashed(`${sourcePath}-wal`, `${copyPath}-wal`, hash);
  }
  // A rollback journal left by a crash is replayed on the copy, never on the source.
  if (existsSync(`${sourcePath}-journal`)) {
    copyFileSync(`${sourcePath}-journal`, `${copyPath}-journal`);
  }
  return hash.digest('hex');
}

async function copyHashed(from: string, to: string, hash: Hash): Promise<void> {
  await pipeline(
    createReadStream(from),
    async function* (chunks: AsyncIterable<Buffer>) {
      for await (const chunk of chunks) {
        hash.update(chunk);
        yield chunk;
      }
    },
    createWriteStream(to),
  );
}

/**
 * Opens the copy read-write once, so SQLite replays a leftover journal or checkpoints the WAL
 * into the main file. The migration then opens it read-only.
 */
function settleCopy(copyPath: string): void {
  const db: Database.Database = new (DatabaseConstructor as unknown as typeof Database)(copyPath);
  try {
    db.prepare('SELECT count(*) FROM sqlite_master').get();
    if (db.pragma('journal_mode', { simple: true }) === 'wal') {
      db.pragma('wal_checkpoint(TRUNCATE)');
    }
  } finally {
    db.close();
  }
}

async function notEmptyReason(target: DatabaseClient): Promise<string | null> {
  const [records] = await query<{ c: number | string }>(
    target,
    sql`SELECT count(*) AS c FROM legacy_migrations`,
  );
  if (Number(records?.c ?? 0) > 0) return 'a different 1.4.0 database was already migrated into it';
  const [users] = await query<{ c: number | string }>(target, sql`SELECT count(*) AS c FROM users`);
  const userCount = Number(users?.c ?? 0);
  if (userCount > 0) return `it already has ${userCount} user${userCount === 1 ? '' : 's'}`;
  return null;
}

async function recordMigration(
  tx: DatabaseClient,
  sourceSha256: string,
  result: MigrationResult,
): Promise<void> {
  const statement = sql`INSERT INTO legacy_migrations
    (source_sha256, batch_id, counts, legacy_coins, migrated_coins, migrated_at)
    VALUES (${sourceSha256}, ${result.batchId}, ${JSON.stringify(result.migratedCounts)},
      ${result.inspected.totalCoins.toString()}, ${result.totalCoinsMigrated.toString()}, ${Date.now()})`;
  if (tx.dialect === 'sqlite') tx.db.run(statement);
  else await tx.db.execute(statement);
}

async function query<T>(client: DatabaseClient, statement: SQL): Promise<T[]> {
  return client.dialect === 'sqlite'
    ? (client.db.all(statement) as T[])
    : ((await client.db.execute(statement)).rows as T[]);
}
