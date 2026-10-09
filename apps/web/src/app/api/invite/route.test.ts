import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SecretVault } from '@ririko/core';
import { DiscordOAuthClient } from '@/lib/server/auth/discord-oauth';
import { openPendingInvite, openPendingLogin } from '@/lib/server/auth/oauth-state';
import { BOT_INVITE_PERMISSIONS } from '@/lib/server/guilds/permissions';
import { rateLimits } from '@/lib/server/rate-limit';

const GUILD = '100000000000000001';
const vault = new SecretVault({ version: 1, hexKey: 'b'.repeat(64) });
const inviteOauth = new DiscordOAuthClient({
  clientId: '123456789012345678',
  clientSecret: 'client-secret-for-tests',
  redirectUri: 'https://dash.example.com/api/invite/callback',
});

vi.mock('@/lib/server/services', () => ({
  getWebServices: async () => ({ inviteOauth, vault }),
}));

const { GET } = await import('./route');

let nextIp = 0;
function invite(guild?: string, ip = `198.51.100.${++nextIp}`): Promise<Response> {
  const url = new URL('https://dash.example.com/api/invite');
  if (guild !== undefined) url.searchParams.set('guild', guild);
  return GET(new NextRequest(url, { headers: { 'x-forwarded-for': ip } }));
}

function inviteCookie(response: Response): string {
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith('__Host-ririko_invite='));
  expect(cookie).toBeDefined();
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/Secure/i);
  expect(cookie).toMatch(/SameSite=lax/i);
  expect(cookie).toMatch(/Max-Age=600/i);
  return decodeURIComponent(cookie!.split(';')[0]!.split('=').slice(1).join('='));
}

describe('GET /api/invite (TASK-1841)', () => {
  beforeEach(() => {
    nextIp += 1;
  });

  it('redirects to Discord with the bot scopes, permissions, one server and PKCE, without a session', async () => {
    const response = await invite(GUILD);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin + location.pathname).toBe(
      'https://discord.com/api/v10/oauth2/authorize',
    );
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      client_id: '123456789012345678',
      response_type: 'code',
      redirect_uri: 'https://dash.example.com/api/invite/callback',
      scope: 'bot applications.commands identify',
      permissions: BOT_INVITE_PERMISSIONS.toString(),
      guild_id: GUILD,
      disable_guild_select: 'true',
      code_challenge_method: 'S256',
    });
    expect(location.searchParams.get('code_challenge')).toBeTruthy();
    expect(location.searchParams.has('prompt')).toBe(false);
  });

  it('seals the state, verifier and server in its own cookie, not the sign-in cookie', async () => {
    const response = await invite(GUILD);
    const state = new URL(response.headers.get('location')!).searchParams.get('state')!;
    const sealed = inviteCookie(response);

    const pending = openPendingInvite(vault, sealed, state, new Date());
    expect(pending).toMatchObject({ guildId: GUILD });
    expect(pending?.codeVerifier).toBeTruthy();
    expect(openPendingLogin(vault, sealed, state, new Date())).toBeNull();
    expect(response.headers.getSetCookie().some((c) => c.startsWith('__Host-ririko_oauth='))).toBe(
      false,
    );
  });

  it('lets the user choose the server when no valid guild is given', async () => {
    for (const guild of [undefined, '', 'not-a-snowflake', '123', `${GUILD}0000000`]) {
      const response = await invite(guild);
      const location = new URL(response.headers.get('location')!);
      expect(location.searchParams.has('guild_id')).toBe(false);
      expect(location.searchParams.has('disable_guild_select')).toBe(false);
      const state = location.searchParams.get('state')!;
      expect(
        openPendingInvite(vault, inviteCookie(response), state, new Date())?.guildId,
      ).toBeNull();
    }
  });

  it('answers 429 once a client IP is over the auth rate limit', async () => {
    const ip = '198.51.100.251';
    while (rateLimits.auth.take(`ip:${ip}`)) {
      /* drain the bucket */
    }
    const response = await invite(GUILD, ip);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
  });
});
