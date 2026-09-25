import 'server-only';
import { headers } from 'next/headers';
import { clientIp, isSameOrigin, userAgent } from './auth/request';
import { getWebServices } from './services';

/**
 * Origin check for Server Actions. Next.js already rejects cross-origin actions; this repeats
 * the check against the configured dashboard origin so a proxy misconfiguration cannot open it.
 */
export async function isDashboardRequest(): Promise<boolean> {
  const { config } = await getWebServices();
  return isSameOrigin(await headers(), config.DASHBOARD_URL);
}

/** Client IP and user agent of the current request, for audit entries. */
export async function requestActor(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  const requestHeaders = await headers();
  return { ipAddress: clientIp(requestHeaders), userAgent: userAgent(requestHeaders) };
}
