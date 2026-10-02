import 'server-only';
import type { DatabaseClient } from '@ririko/database';

const processStartedAt = Date.now();

export interface WebProbeDeps {
  /** The dashboard's database; rejects while the configuration or connection is broken. */
  database(): Promise<DatabaseClient>;
  version: string;
  now?: () => number;
}

/**
 * `/health` and `/ready` for Docker and orchestrators. The dashboard is public, so the body
 * never carries error text (hosts, configuration names); the server log does.
 * Both answer 503 while the database cannot be reached.
 */
export async function webProbe(kind: 'health' | 'ready', deps: WebProbeDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  let ok = false;
  let latencyMs = 0;
  try {
    const result = await (await deps.database()).ping();
    ok = result.ok;
    latencyMs = result.latencyMs;
    if (!ok) console.error(`[web] ${kind} probe: database ping failed: ${result.error ?? ''}`);
  } catch (error) {
    console.error(`[web] ${kind} probe: dashboard not available:`, error);
  }
  const body =
    kind === 'ready'
      ? { ready: ok }
      : {
          status: ok ? 'healthy' : 'unhealthy',
          version: deps.version,
          uptimeSeconds: Math.floor((now() - processStartedAt) / 1000),
          database: { status: ok ? 'CONNECTED' : 'UNREACHABLE', latencyMs },
        };
  return Response.json(body, { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
