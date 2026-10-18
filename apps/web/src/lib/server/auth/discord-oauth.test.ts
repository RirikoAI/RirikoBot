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

  it('sends every request to a configured API base', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: 'u1' }));
    const client = new DiscordOAuthClient({
      ...options,
      apiBase: 'http://127.0.0.1:3199/api/v10',
      fetch,
    });

    const authorize = new URL(client.authorizationUrl({ state: 's1', codeChallenge: 'c1' }));
    expect(authorize.origin + authorize.pathname).toBe(
      'http://127.0.0.1:3199/api/v10/oauth2/authorize',
    );
    await client.getCurrentUserGuilds('at');
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:3199/api/v10/users/@me/guilds?limit=200',
    );
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

  describe('bot invite (TASK-1841)', () => {
    const invite = { ...options, redirectUri: 'https://dash.example.com/api/invite/callback' };
    const tokenBody = {
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 604800,
      scope: 'bot applications.commands identify',
      token_type: 'Bearer',
    };

    it('builds the invite URL with the bot scopes, permissions, PKCE and one server', () => {
      const url = new URL(
        new DiscordOAuthClient(invite).inviteUrl({
          state: 's1',
          codeChallenge: 'c1',
          permissions: 626721090433015n,
          guildId: '100000000000000001',
        }),
      );
      expect(url.origin + url.pathname).toBe('https://discord.com/api/v10/oauth2/authorize');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        client_id: 'client-1',
        response_type: 'code',
        redirect_uri: invite.redirectUri,
        scope: 'bot applications.commands identify',
        permissions: '626721090433015',
        state: 's1',
        code_challenge: 'c1',
        code_challenge_method: 'S256',
        guild_id: '100000000000000001',
        disable_guild_select: 'true',
      });
    });

    it('leaves the server choice to the user without a guild ID and never sets prompt', () => {
      const url = new URL(
        new DiscordOAuthClient(invite).inviteUrl({
          state: 's1',
          codeChallenge: 'c1',
          permissions: 8n,
        }),
      );
      expect(url.searchParams.has('guild_id')).toBe(false);
      expect(url.searchParams.has('disable_guild_select')).toBe(false);
      expect(url.searchParams.has('prompt')).toBe(false);
    });

    it('exchanges the code and reads the server from the token response', async () => {
      const fetch = vi.fn().mockResolvedValue(
        Response.json({
          ...tokenBody,
          guild: { id: 'g1', name: 'Server', icon: 'abc', owner_id: 'o1', features: [] },
        }),
      );
      const now = new Date('2026-10-10T00:00:00Z');

      const result = await new DiscordOAuthClient({ ...invite, fetch }).exchangeInviteCode(
        'code-1',
        'verifier-1',
        now,
      );

      expect(result.guild).toEqual({ id: 'g1', name: 'Server', icon: 'abc', ownerId: 'o1' });
      expect(result.tokens).toEqual({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date(now.getTime() + 604800 * 1000),
        scopes: ['bot', 'applications.commands', 'identify'],
      });
      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://discord.com/api/v10/oauth2/token');
      const body = init.body as URLSearchParams;
      expect(body.get('redirect_uri')).toBe(invite.redirectUri);
      expect(body.get('code_verifier')).toBe('verifier-1');
    });

    it('reports no server when the response has none or a malformed one', async () => {
      for (const guild of [undefined, null, 'g1', { id: 'g1' }, { id: 'g1', name: 'S' }]) {
        const fetch = vi.fn().mockResolvedValue(Response.json({ ...tokenBody, guild }));
        const result = await new DiscordOAuthClient({ ...invite, fetch }).exchangeInviteCode(
          'c',
          'v',
          new Date(),
        );
        expect(result.guild).toBeNull();
      }
    });

    it('keeps a server without an icon', async () => {
      const fetch = vi.fn().mockResolvedValue(
        Response.json({
          ...tokenBody,
          guild: { id: 'g1', name: 'S', icon: null, owner_id: 'o1' },
        }),
      );
      const result = await new DiscordOAuthClient({ ...invite, fetch }).exchangeInviteCode(
        'c',
        'v',
        new Date(),
      );
      expect(result.guild).toEqual({ id: 'g1', name: 'S', icon: null, ownerId: 'o1' });
    });

    it('revokes a token with client authentication', async () => {
      const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

      await new DiscordOAuthClient({ ...invite, fetch }).revokeToken('at');

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://discord.com/api/v10/oauth2/token/revoke');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Basic ${Buffer.from('client-1:secret-1').toString('base64')}`,
      );
      const body = init.body as URLSearchParams;
      expect(body.get('token')).toBe('at');
      expect(body.get('token_type_hint')).toBe('access_token');
    });

    it('raises DiscordApiError when the revocation fails', async () => {
      const fetch = vi.fn().mockResolvedValue(new Response('nope at', { status: 400 }));
      const error = await new DiscordOAuthClient({ ...invite, fetch })
        .revokeToken('at')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DiscordApiError);
      expect((error as Error).message).not.toContain('nope');
    });
  });

  it('creates an S256 PKCE pair', () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
});
