import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createPkcePair, DiscordApiError, DiscordOAuthClient } from './discord-oauth';

const options = {
  clientId: 'client-1',
  clientSecret: 'secret-1',
  redirectUri: 'https://dash.example.com/api/auth/callback',
};

describe('DiscordOAuthClient', () => {
  it('builds an authorization URL with least-privilege scopes, state and PKCE', () => {
    const url = new URL(
      new DiscordOAuthClient(options).authorizationUrl({ state: 's1', codeChallenge: 'c1' }),
    );
    expect(url.origin + url.pathname).toBe('https://discord.com/api/v10/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'client-1',
      response_type: 'code',
      redirect_uri: options.redirectUri,
      scope: 'identify guilds',
      state: 's1',
      code_challenge: 'c1',
      code_challenge_method: 'S256',
    });
  });

  it('exchanges a code with client authentication and the PKCE verifier', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 604800,
        scope: 'identify guilds',
        token_type: 'Bearer',
      }),
    );
    const now = new Date('2026-09-25T00:00:00Z');
    const tokens = await new DiscordOAuthClient({ ...options, fetch }).exchangeCode(
      'code-1',
      'verifier-1',
      now,
    );

    expect(tokens).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: new Date(now.getTime() + 604800 * 1000),
      scopes: ['identify', 'guilds'],
    });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/v10/oauth2/token');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('client-1:secret-1').toString('base64')}`,
    );
    const body = init.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe('verifier-1');
    expect(body.get('redirect_uri')).toBe(options.redirectUri);
  });

  it('raises DiscordApiError with the status and without the response body', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ error: 'invalid_grant', echo: 'rt' }, { status: 400 }));
    const error = await new DiscordOAuthClient({ ...options, fetch })
      .refresh('rt', new Date())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DiscordApiError);
    expect((error as DiscordApiError).status).toBe(400);
    expect((error as Error).message).not.toContain('rt');
  });

  it('creates an S256 PKCE pair', () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
});
