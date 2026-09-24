import 'server-only';

export const DEFAULT_RETURN_TO = '/servers';

/**
 * Keeps post-login redirects on this site. Only same-origin paths are accepted, which blocks
 * open redirects such as `//evil.example` or `/\evil.example`.
 */
export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return DEFAULT_RETURN_TO;
  }
  const base = 'http://dashboard.invalid';
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return DEFAULT_RETURN_TO;
  }
  if (url.origin !== base || url.pathname.startsWith('/api/')) return DEFAULT_RETURN_TO;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Client IP for the session record and audit trail. X-Forwarded-For is only trustworthy behind
 * a proxy that overwrites it, so the value is informational and never used for authorization.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || headers.get('x-real-ip')?.trim();
  return ip ? ip.slice(0, 64) : null;
}

export function userAgent(headers: Headers): string | null {
  return headers.get('user-agent')?.slice(0, 512) ?? null;
}

/** CSRF check for route handlers: the browser-set Origin header must be the dashboard's. */
export function isSameOrigin(headers: Headers, dashboardOrigin: string): boolean {
  return headers.get('origin') === dashboardOrigin;
}
