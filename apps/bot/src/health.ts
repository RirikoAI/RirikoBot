import { createServer, type Server } from 'node:http';

/** Inputs are injected so readiness can be tested without a Discord connection. */
export interface HealthDependencies {
  isGatewayReady(): boolean;
  checkDatabase(): Promise<void>;
  isShuttingDown(): boolean;
  probeTimeoutMs?: number;
}

/** Liveness is independent of external systems; readiness fails closed. */
export function createHealthServer(dependencies: HealthDependencies): Server {
  let probing = false;
  async function databaseReady(): Promise<boolean> {
    // A stuck driver leaves at most one outstanding probe, not one per request.
    if (probing) return false;
    probing = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const operation = Promise.resolve().then(() => dependencies.checkDatabase())
      .then(() => true, () => false).finally(() => { probing = false; });
    try {
      return await Promise.race([
        operation,
        new Promise<boolean>((resolve) => { timeout = setTimeout(() => resolve(false), dependencies.probeTimeoutMs ?? 2000); }),
      ]);
    } finally { if (timeout) clearTimeout(timeout); }
  }
  return createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') {
      response.writeHead(405).end(JSON.stringify({ status: 'method_not_allowed' }));
      return;
    }
    if (request.url === '/health/live') {
      response.writeHead(200).end(JSON.stringify({ status: 'alive' }));
      return;
    }
    if (request.url !== '/health/ready') {
      response.writeHead(404).end(JSON.stringify({ status: 'not_found' }));
      return;
    }
    void (async () => {
      const database = await databaseReady();
      const discord = dependencies.isGatewayReady();
      const ready = database && discord && !dependencies.isShuttingDown();
      response.writeHead(ready ? 200 : 503).end(JSON.stringify({ status: ready ? 'ready' : 'not_ready', checks: { database, discord } }));
    })().catch(() => { if (!response.writableEnded) response.writeHead(503).end('{"status":"not_ready"}'); });
  });
}
