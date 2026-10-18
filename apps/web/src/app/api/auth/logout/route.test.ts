import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { rateLimits } from '@/lib/server/rate-limit';

const revoke = vi.fn();
vi.mock('@/lib/server/services', () => ({
  getWebServices: async () => ({
    config: { DASHBOARD_URL: 'https://dash.example.com' },
    sessions: { revoke },
  }),
}));

const { POST } = await import('./route');

let nextIp = 0;
function logout(init: { origin?: string; cookie?: string; ip?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'x-forwarded-for': init.ip ?? `198.51.100.${++nextIp}`,
  };
  if (init.origin) headers.origin = init.origin;
  if (init.cookie) headers.cookie = init.cookie;
  return POST(
    new NextRequest('https://dash.example.com/api/auth/logout', { method: 'POST', headers }),
  );
}

describe('POST /api/auth/logout', () => {
  beforeEach(() => revoke.mockReset());

  it('revokes the session, clears the cookie and redirects home with 303', async () => {
    const response = await logout({
      origin: 'https://dash.example.com',
      cookie: '__Host-ririko_session=the-token',
    });
    expect(revoke).toHaveBeenCalledWith('the-token');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://dash.example.com/');
    const cleared = response.headers
      .getSetCookie()
      .find((c) => c.startsWith('__Host-ririko_session='));
    expect(cleared).toMatch(/Max-Age=0/i);
    expect(cleared).toMatch(/Secure/i);
  });

  it('still clears the cookie when there was no session to revoke', async () => {
    const response = await logout({ origin: 'https://dash.example.com' });
    expect(revoke).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
  });

  it('answers 403 and revokes nothing for another origin', async () => {
    const response = await logout({
      origin: 'https://evil.example',
      cookie: '__Host-ririko_session=the-token',
    });
    expect(response.status).toBe(403);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('answers 429 once a client IP is over the auth rate limit', async () => {
    const ip = '198.51.100.251';
    while (rateLimits.auth.take(`ip:${ip}`)) {
      /* drain the bucket */
    }
    const response = await logout({ origin: 'https://dash.example.com', ip });
    expect(response.status).toBe(429);
    expect(revoke).not.toHaveBeenCalled();
  });
});
