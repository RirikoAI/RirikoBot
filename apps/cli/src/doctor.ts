import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { type RuntimeConfig } from '@ririko/core';
import type { DatabaseConnection } from '@ririko/database';

/** Diagnostics are status-only; never return credential values or driver error text. */
export interface DoctorCheck { name: string; status: 'ok' | 'error' | 'optional'; detail: string }

/** Probe configuration, storage, migration state and optional audio tooling without mutations. */
export async function diagnose(config: RuntimeConfig, database: DatabaseConnection, cwd: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push({ name: 'Node.js', status: major === 24 ? 'ok' : 'error', detail: process.versions.node });
  checks.push({ name: 'Configuration', status: 'ok', detail: `${config.environment}; ${config.database.dialect}` });
  checks.push({ name: 'Discord token', status: config.discord.token ? 'ok' : 'error', detail: config.discord.token ? 'Configured; not validated with Discord' : 'DISCORD_TOKEN is missing' });
  checks.push({ name: 'Discord application', status: config.discord.applicationId ? 'ok' : 'error', detail: config.discord.applicationId ? 'Configured; not validated with Discord' : 'DISCORD_APPLICATION_ID is missing' });
  const needsStorage = config.database.dialect === 'sqlite' && config.database.url !== ':memory:';
  let storagePath = needsStorage ? resolve(cwd, config.database.url) : cwd;
  while (needsStorage) {
    try { await access(storagePath, constants.F_OK); break; } catch {
      const parent = dirname(storagePath);
      if (parent === storagePath) break;
      storagePath = parent;
    }
  }
  try {
    await access(storagePath, needsStorage ? constants.R_OK | constants.W_OK : constants.R_OK);
    checks.push({ name: 'Filesystem', status: 'ok', detail: needsStorage ? 'Database storage is readable and writable' : 'Application directory is readable; no local database volume required' });
  } catch { checks.push({ name: 'Filesystem', status: 'error', detail: 'Required application/database storage access is unavailable' }); }
  try {
    await database.healthCheck();
    checks.push({ name: 'Database', status: 'ok', detail: 'Connection probe succeeded' });
  } catch { checks.push({ name: 'Database', status: 'error', detail: 'Database is missing, not migrated, or unavailable' }); }
  try {
    const migration = await database.migrationStatus();
    checks.push({ name: 'Migrations', status: migration.current === migration.latest ? 'ok' : 'error', detail: `${migration.current}/${migration.latest}; apply pending versions with ririko migrate` });
  } catch { checks.push({ name: 'Migrations', status: 'error', detail: 'Could not verify migration history' }); }
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { timeout: 3000, windowsHide: true, stdio: 'ignore' });
  checks.push({ name: 'FFmpeg', status: ffmpeg.status === 0 ? 'ok' : 'optional', detail: ffmpeg.status === 0 ? 'Available' : 'Not installed; needed when audio is enabled' });
  checks.push({ name: 'Providers', status: 'optional', detail: 'AI, images, music, and stream adapters are pending implementation' });
  return checks;
}
