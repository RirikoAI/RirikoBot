import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type Database from 'better-sqlite3';
import type pg from 'pg';

export type DatabaseDialect = 'postgres' | 'sqlite';

export interface DatabaseConfig {
  dialect: DatabaseDialect;
  url: string;
  maxConnections?: number | undefined;
  idleTimeoutMs?: number | undefined;
  connectionTimeoutMs?: number | undefined;
  walMode?: boolean | undefined;
  foreignKeys?: boolean | undefined;
  synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA' | undefined;
  autoMigrate?: boolean | undefined;
}

export interface PingResult {
  ok: boolean;
  dialect: DatabaseDialect;
  latencyMs: number;
  error?: string | undefined;
}

export interface BaseDatabaseClient {
  readonly dialect: DatabaseDialect;
  close(): Promise<void>;
  ping(): Promise<PingResult>;
}

export interface SqliteDatabaseClient extends BaseDatabaseClient {
  readonly dialect: 'sqlite';
  readonly db: BetterSQLite3Database<Record<string, unknown>>;
  readonly raw: Database.Database;
}

export interface PostgresDatabaseClient extends BaseDatabaseClient {
  readonly dialect: 'postgres';
  readonly db: NodePgDatabase<Record<string, unknown>>;
  readonly raw: pg.Pool;
}

export type DatabaseClient = SqliteDatabaseClient | PostgresDatabaseClient;
