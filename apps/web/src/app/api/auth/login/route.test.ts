import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SecretVault } from '@ririko/core';
import { DiscordOAuthClient } from '@/lib/server/auth/discord-oauth';
import { openPendingLogin } from '@/lib/server/auth/oauth-state';
import { rateLimits } from '@/lib/server/rate-limit';

const vault = new SecretVault({ version: 1, hexKey: 'b'.repeat(64) });
const oauth = new DiscordOAuthClient({
  clientId: '123456789012345678',
  clientSecret: 'client-secret-for-tests',
  redirectUri: 'https://dash.example.com/api/auth/callback',
});

vi.mock('@/lib/server/services', () => ({ getWebServices: async () => ({ oauth, vault }) }));

const { GET } = await import('./route');

let nextIp = 0;
function login(returnTo?: string, ip = `198.51.100.${++nextIp}`): Promise<Response> {
  const url = new URL('https://dash.example.com/api/auth/login');
  if (returnTo) url.searchParams.set('returnTo', returnTo);
  return GET(new NextRequest(url, { headers: { 'x-forwarded-for': ip } }));
}

describe('GET /api/auth/login', () => {
  beforeEach(() => {
    nextIp += 1;
  });

  it('redirects to Discord with the state and PKCE challenge, and seals the pending login in a cookie', async () => {
    const response = await login('/dashboard/100000000000000001');
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe('https://discord.com');
    expect(location.searchParams.get('client_id')).toBe('123456789012345678');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('scope')).toBe('identify guilds');

    const cookie = response.headers
      .getSetCookie()
      .find((c) => c.startsWith('__Host-ririko_oauth='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Max-Age=600/i);
    const sealed = decodeURIComponent(cookie!.split(';')[0]!.split('=').slice(1).join('='));
    const pending = openPendingLogin(
      vault,
      sealed,
      location.searchParams.get('state')!,
      new Date(),
    );
    expect(pending).toMatchObject({ returnTo: '/dashboard/100000000000000001' });
    expect(pending?.codeVerifier).toBeTruthy();
  });

  it('falls back to the server list when returnTo would leave the site', async () => {
    const response = await login('//evil.example/phish');
    const cookie = response.headers
      .getSetCookie()
      .find((c) => c.startsWith('__Host-ririko_oauth='))!;
    const sealed = decodeURIComponent(cookie.split(';')[0]!.split('=').slice(1).join('='));
    const state = new URL(response.headers.get('location')!).searchParams.get('state')!;
    expect(openPendingLogin(vault, sealed, state, new Date())?.returnTo).toBe('/servers');
  });

  it('answers 429 once a client IP is over the auth rate limit', async () => {
    const ip = '198.51.100.250';
    while (rateLimits.auth.take(`ip:${ip}`)) {
      /* drain the bucket */
    }
    const response = await login(undefined, ip);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
  });
});
