import { webProbe } from '@/lib/server/health';
import { limitProbeRequest } from '@/lib/server/rate-limit';
import { getWebServices } from '@/lib/server/services';
import { CORE_VERSION } from '@ririko/core';

export const dynamic = 'force-dynamic';

/** Readiness for orchestrators; also served at `/ready`. */
export async function GET(request: Request) {
  const limited = limitProbeRequest(request);
  if (limited) return limited;
  return webProbe('ready', {
    database: async () => (await getWebServices()).db,
    version: CORE_VERSION,
  });
}
