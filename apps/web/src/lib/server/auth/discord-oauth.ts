import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { ExternalApiError } from '@ririko/core';
import {
  OAuth2Routes,
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

export interface DiscordOAuthOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
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

/** Discord OAuth2 authorization-code flow and the user-token endpoints the dashboard reads. */
export class DiscordOAuthClient {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: DiscordOAuthOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  authorizationUrl(params: { state: string; codeChallenge: string }): string {
    const url = new URL(OAuth2Routes.authorizationURL);
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
    const basic = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString(
      'base64',
    );
    const response = await this.fetch(`${RouteBases.api}${Routes.oauth2TokenExchange()}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
      cache: 'no-store',
    });
    const body = (await this.parse(response, 'token exchange')) as RESTPostOAuth2AccessTokenResult;
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: new Date(now.getTime() + body.expires_in * 1000),
      scopes: body.scope.split(' '),
    };
  }

  private async requestJson<T>(path: string, accessToken: string): Promise<T> {
    const response = await this.fetch(`${RouteBases.api}${path}`, {
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
