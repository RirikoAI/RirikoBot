import 'server-only';
import { isIP } from 'node:net';
import { ClientIpHeaderSchema } from '@ririko/core';

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

let cachedClientIpHeader:
  { raw: string | undefined; header: string | undefined | null } | undefined;

/**
 * The header named by `CLIENT_IP_HEADER`, parsed with the core schema once per distinct value.
 * `null` means the variable is set but malformed (startup validation normally stops that first),
 * which fails closed instead of falling back to a spoofable header.
 */
function trustedClientIpHeader(): string | undefined | null {
  const raw = process.env.CLIENT_IP_HEADER;
  if (!cachedClientIpHeader || cachedClientIpHeader.raw !== raw) {
    const parsed = ClientIpHeaderSchema.safeParse(raw);
    cachedClientIpHeader = { raw, header: parsed.success ? parsed.data : null };
  }
  return cachedClientIpHeader.header;
}

/**
 * Client IP for rate-limit keys, the session record and the audit trail. By default it is the
 * first X-Forwarded-For hop, which a client can forge unless a proxy overwrites the header. Behind
 * Cloudflare that entry is attacker-controlled, so `CLIENT_IP_HEADER` (cf-connecting-ip) names the
 * one header to trust instead: its value must be a valid IP address, and there is no fallback to
 * X-Forwarded-For or X-Real-IP. Set it only when every request reaches the dashboard through the
 * proxy that sets the header.
 */
export function clientIp(headers: Headers): string | null {
  const trusted = trustedClientIpHeader();
  if (trusted !== undefined) {
    const value = trusted === null ? null : headers.get(trusted)?.trim();
    return value && isIP(value) ? value : null;
  }
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
