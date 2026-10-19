import 'server-only';
import type { DatabaseClient } from '@ririko/database';
import { SchemaNotReadyError } from './schema-guard';

const processStartedAt = Date.now();

export interface WebProbeDeps {
  /** The dashboard's database; rejects while the configuration or connection is broken. */
  database(): Promise<DatabaseClient>;
  version: string;
  now?: () => number;
}

/** The `database` block of `/health` for a schema that is not ready. Lists ids only for `pending`. */
function schemaDatabaseStatus(
  error: SchemaNotReadyError,
): { status: 'MIGRATION_PENDING'; pending: readonly string[] } | { status: 'SCHEMA_INCOMPATIBLE' } {
  return error.reason === 'incompatible'
    ? { status: 'SCHEMA_INCOMPATIBLE' }
    : { status: 'MIGRATION_PENDING', pending: error.pending };
}

/**
 * `/health` and `/ready` for Docker and orchestrators. The dashboard is public, so the body
 * never carries error text (hosts, configuration names); the server log does.
 *
 * `/health` is liveness: it answers 503 while the database cannot be reached, but 200 while the
 * database works and only its schema is not ready for this release (ADR-015: the bot applies the
 * migrations). It reports `database.status = MIGRATION_PENDING` with the pending ids, or
 * `SCHEMA_INCOMPATIBLE` when the downgrade guard refused. A failing liveness probe would mark the
 * container unhealthy, and the host watchdog restarts unhealthy containers. `/ready` answers 503 in
 * both cases and logs why.
 */
export async function webProbe(kind: 'health' | 'ready', deps: WebProbeDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  let ok = false;
  let latencyMs = 0;
  let schema: SchemaNotReadyError | null = null;
  try {
    const result = await (await deps.database()).ping();
    ok = result.ok;
    latencyMs = result.latencyMs;
    if (!ok) console.error(`[web] ${kind} probe: database ping failed: ${result.error ?? ''}`);
  } catch (error) {
    if (error instanceof SchemaNotReadyError) schema = error;
    // Liveness is polled all the time and the cause does not change, so only readiness logs it.
    if (schema === null || kind === 'ready') {
      console.error(`[web] ${kind} probe: dashboard not available:`, error);
    }
  }
  // A dashboard that waits for migrations, or refuses an incompatible schema, is alive, just not ready.
  const alive = ok || schema !== null;
  const body =
    kind === 'ready'
      ? { ready: ok }
      : {
          status: alive ? 'healthy' : 'unhealthy',
          version: deps.version,
          uptimeSeconds: Math.floor((now() - processStartedAt) / 1000),
          database: schema
            ? schemaDatabaseStatus(schema)
            : { status: ok ? 'CONNECTED' : 'UNREACHABLE', latencyMs },
        };
  const healthy = kind === 'ready' ? ok : alive;
  return Response.json(body, {
    status: healthy ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
