import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { ExternalApiError } from '@ririko/core';
import {
  OAuth2Scopes,
  RouteBases,
  Routes,
  type RESTGetAPICurrentUserGuildsResult,
  type RESTGetAPICurrentUserResult,
  type RESTPostOAuth2AccessTokenResult,
} from 'discord-api-types/v10';

/** Least privilege (ADR-013): the user token can only read the profile and guild list. */
export const DASHBOARD_OAUTH_SCOPES = [OAuth2Scopes.Identify, OAuth2Scopes.Guilds] as const;

export class DiscordApiError extends ExternalApiError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super('Discord', message, { externalStatusCode: status });
  }
}

export interface DiscordTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}

/** Scopes of the dashboard invite flow: add the bot and commands, and learn who authorized it. */
export const INVITE_OAUTH_SCOPES = [
  OAuth2Scopes.Bot,
  OAuth2Scopes.ApplicationsCommands,
  OAuth2Scopes.Identify,
] as const;

/** The server the bot was added to, from the `guild` object of the token response. */
export interface InvitedGuild {
  id: string;
  name: string;
  /** The icon hash, or null when the server has no icon. */
  icon: string | null;
  ownerId: string;
}

export interface DiscordOAuthOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Versioned API base, `https://discord.com/api/v10` by default. Tests point it at a local fake. */
  apiBase?: string;
  fetch?: typeof fetch;
}

/** 32 random bytes as base64url (43 characters). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** RFC 7636 PKCE pair using the S256 method, the only one Discord supports. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken();
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function toTokenSet(body: RESTPostOAuth2AccessTokenResult, now: Date): DiscordTokenSet {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(now.getTime() + body.expires_in * 1000),
    scopes: body.scope.split(' '),
  };
}

/** The token response's `guild` is not in `RESTPostOAuth2AccessTokenResult`, so check every field. */
function parseInvitedGuild(raw: unknown): InvitedGuild | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, name, icon, owner_id: ownerId } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof ownerId !== 'string') {
    return null;
  }
  return { id, name, icon: typeof icon === 'string' ? icon : null, ownerId };
}

/** Discord OAuth2 authorization-code flow and the user-token endpoints the dashboard reads. */
export class DiscordOAuthClient {
  private readonly fetch: typeof fetch;
  private readonly apiBase: string;

  constructor(private readonly options: DiscordOAuthOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.apiBase = options.apiBase ?? RouteBases.api;
  }

  authorizationUrl(params: { state: string; codeChallenge: string }): string {
    const url = new URL(`${this.apiBase}${Routes.oauth2Authorization()}`);
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      response_type: 'code',
      redirect_uri: this.options.redirectUri,
      scope: DASHBOARD_OAUTH_SCOPES.join(' '),
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'none',
    }).toString();
    return url.toString();
  }

  /**
   * The bot invite URL: authorizes the bot and commands, and the user's identity, for one server
   * when `guildId` is given. With Requires OAuth2 Code Grant on, Discord adds the bot only after
   * `exchangeInviteCode` succeeds, so the user who authorized it is always known. The `bot` scope
   * always shows the consent screen, so there is no `prompt`.
   */
  inviteUrl(params: {
    state: string;
    codeChallenge: string;
    permissions: bigint;
    guildId?: string | undefined;
  }): string {
    const url = new URL(`${this.apiBase}${Routes.oauth2Authorization()}`);
    const query = new URLSearchParams({
      client_id: this.options.clientId,
      response_type: 'code',
      redirect_uri: this.options.redirectUri,
      scope: INVITE_OAUTH_SCOPES.join(' '),
      permissions: params.permissions.toString(),
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
    });
    if (params.guildId) {
      query.set('guild_id', params.guildId);
      query.set('disable_guild_select', 'true');
    }
    url.search = query.toString();
    return url.toString();
  }

  /**
   * Exchanges the code of an invite. `guild` is null when the response names no usable server,
   * for example when the user authorized without the `bot` scope.
   */
  async exchangeInviteCode(
    code: string,
    codeVerifier: string,
    now: Date,
  ): Promise<{ tokens: DiscordTokenSet; guild: InvitedGuild | null }> {
    const body = await this.postToken(
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.options.redirectUri,
        code_verifier: codeVerifier,
      },
      'token exchange',
    );
    return { tokens: toTokenSet(body, now), guild: parseInvitedGuild(body.guild) };
  }

  /** Revokes a user token (RFC 7009); the invite flow keeps none of its tokens. */
  async revokeToken(accessToken: string): Promise<void> {
    const response = await this.fetch(`${this.apiBase}${Routes.oauth2TokenRevocation()}`, {
      method: 'POST',
      headers: this.tokenHeaders(),
      body: new URLSearchParams({ token: accessToken, token_type_hint: 'access_token' }),
      cache: 'no-store',
    });
    // The response body is empty or irrelevant; only the status matters.
    if (!response.ok) {
      throw new DiscordApiError(
        response.status,
        `token revocation failed with HTTP ${response.status}`,
      );
    }
  }

  exchangeCode(code: string, codeVerifier: string, now: Date): Promise<DiscordTokenSet> {
    return this.requestToken(
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.options.redirectUri,
        code_verifier: codeVerifier,
      },
      now,
    );
  }

  refresh(refreshToken: string, now: Date): Promise<DiscordTokenSet> {
    return this.requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken }, now);
  }

  getCurrentUser(accessToken: string): Promise<RESTGetAPICurrentUserResult> {
    return this.requestJson(Routes.user(), accessToken);
  }

  /** A user is in at most 200 guilds, which fits in one page. */
  getCurrentUserGuilds(accessToken: string): Promise<RESTGetAPICurrentUserGuildsResult> {
    return this.requestJson(`${Routes.userGuilds()}?limit=200`, accessToken);
  }

  private async requestToken(params: Record<string, string>, now: Date): Promise<DiscordTokenSet> {
    return toTokenSet(await this.postToken(params, 'token exchange'), now);
  }

  private tokenHeaders(): Record<string, string> {
    const basic = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString(
      'base64',
    );
    return {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }

  private async postToken(
    params: Record<string, string>,
    operation: string,
  ): Promise<RESTPostOAuth2AccessTokenResult & { guild?: unknown }> {
    const response = await this.fetch(`${this.apiBase}${Routes.oauth2TokenExchange()}`, {
      method: 'POST',
      headers: this.tokenHeaders(),
      body: new URLSearchParams(params),
      cache: 'no-store',
    });
    return (await this.parse(response, operation)) as RESTPostOAuth2AccessTokenResult & {
      guild?: unknown;
    };
  }

  private async requestJson<T>(path: string, accessToken: string): Promise<T> {
    const response = await this.fetch(`${this.apiBase}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    return (await this.parse(response, `GET ${path}`)) as T;
  }

  private async parse(response: Response, operation: string): Promise<unknown> {
    if (!response.ok) {
      // Never echo the response body: token endpoint errors can quote submitted values.
      throw new DiscordApiError(
        response.status,
        `${operation} failed with HTTP ${response.status}`,
      );
    }
    return response.json();
  }
}
