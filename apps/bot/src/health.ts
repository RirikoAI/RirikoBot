import { createServer, type Server } from 'node:http';
import type { PingResult } from '@ririko/database';

/** Where the probes read the bot's state from. */
export interface HealthSources {
  version: string;
  ping(): Promise<PingResult>;
  gateway(): { state: string; pingMs: number | null };
  /** True once the database, the legacy upgrade and the listeners are set up. */
  started(): boolean;
  now?: () => number;
}

export interface HealthReport {
  status: 'healthy' | 'unhealthy';
  version: string;
  uptimeSeconds: number;
  discord: { status: string; pingMs: number | null };
  database: { status: 'CONNECTED' | 'UNREACHABLE'; latencyMs: number; error?: string };
}

export interface ReadyReport {
  ready: boolean;
  started: boolean;
  discord: string;
  database: boolean;
}

export interface ProbeResponse {
  status: number;
  body: HealthReport | ReadyReport | { error: string };
}

const processStartedAt = Date.now();

/**
 * `GET /health`: 200 while the process and its database work (Docker's HEALTHCHECK).
 * `GET /ready`: 200 only after startup finished and the Discord gateway is READY.
 * Anything else is 404. Errors become 503 so a probe never hangs on an exception.
 */
export async function probe(path: string, sources: HealthSources): Promise<ProbeResponse> {
  const route = path.split('?')[0];
  if (route !== '/health' && route !== '/ready') {
    return { status: 404, body: { error: 'Not found' } };
  }
  const now = sources.now ?? Date.now;
  const db = await sources.ping().catch((err: unknown): PingResult => ({
    ok: false,
    dialect: 'sqlite',
    latencyMs: 0,
    error: err instanceof Error ? err.message : String(err),
  }));
  const gateway = sources.gateway();

  if (route === '/ready') {
    const started = sources.started();
    const ready = started && db.ok && gateway.state === 'READY';
    return {
      status: ready ? 200 : 503,
      body: { ready, started, discord: gateway.state, database: db.ok },
    };
  }

  const report: HealthReport = {
    status: db.ok ? 'healthy' : 'unhealthy',
    version: sources.version,
    uptimeSeconds: Math.floor((now() - processStartedAt) / 1000),
    discord: { status: gateway.state, pingMs: gateway.pingMs },
    database: {
      status: db.ok ? 'CONNECTED' : 'UNREACHABLE',
      latencyMs: db.latencyMs,
      ...(db.error ? { error: db.error } : {}),
    },
  };
  return { status: db.ok ? 200 : 503, body: report };
}

/** The port from `HEALTH_PORT` (default 8080); `0` turns the probes off. */
export function healthPort(env: NodeJS.ProcessEnv = process.env): number {
  const port = Number(env.HEALTH_PORT ?? 8080);
  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : 8080;
}

/** Serves `/health` and `/ready` on all interfaces, so Docker and orchestrators can reach it. */
export function startHealthServer(port: number, sources: HealthSources): Server {
  const server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    void probe(req.url ?? '/', sources).then(({ status, body }) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body));
    });
  });
  server.on('error', (err) => console.error('[Health] Probe server error:', err));
  server.listen(port, '0.0.0.0', () =>
    console.log(`• Health probes on :${port} (/health, /ready)`),
  );
  return server;
}
