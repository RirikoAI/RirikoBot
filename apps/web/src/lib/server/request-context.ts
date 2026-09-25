import 'server-only';
import { headers } from 'next/headers';
import { clientIp, isSameOrigin, userAgent } from './auth/request';
import { getSession } from './auth/session';
import { rateLimits } from './rate-limit';
import { getWebServices } from './services';

const FOREIGN_ORIGIN_MESSAGE = 'This request did not come from the dashboard.';
const RATE_LIMITED_MESSAGE = 'Too many requests. Wait a moment, then try again.';

/**
 * First check in every Server Action; returns why the request is refused, or null.
 * - Origin: Next.js already rejects cross-origin actions; this repeats the check against the
 *   configured dashboard origin so a proxy misconfiguration cannot open it.
 * - Rate limit: per signed-in user, or per client IP before sign-in.
 */
export async function checkDashboardRequest(): Promise<string | null> {
  const { config } = await getWebServices();
  const requestHeaders = await headers();
  if (!isSameOrigin(requestHeaders, config.DASHBOARD_URL)) return FOREIGN_ORIGIN_MESSAGE;
  const session = await getSession();
  const key = session ? `user:${session.userId}` : `ip:${clientIp(requestHeaders) ?? 'unknown'}`;
  return rateLimits.actions.take(key) ? null : RATE_LIMITED_MESSAGE;
}

/** Client IP and user agent of the current request, for audit entries. */
export async function requestActor(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  const requestHeaders = await headers();
  return { ipAddress: clientIp(requestHeaders), userAgent: userAgent(requestHeaders) };
}
