import { webProbe } from '@/lib/server/health';
import { limitProbeRequest } from '@/lib/server/rate-limit';
import { getWebServices } from '@/lib/server/services';
import { CORE_VERSION } from '@ririko/core';

export const dynamic = 'force-dynamic';

/** Liveness for Docker's HEALTHCHECK; also served at `/health`. */
export async function GET(request: Request) {
  const limited = limitProbeRequest(request);
  if (limited) return limited;
  return webProbe('health', {
    database: async () => (await getWebServices()).db,
    version: CORE_VERSION,
  });
}
