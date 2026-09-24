import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { SecretVault } from '@ririko/core';
import type { WebSession, WebSessionRepository } from '@ririko/database';
import { DiscordApiError, type DiscordOAuthClient, type DiscordTokenSet } from './discord-oauth';

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60_000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60_000;
/** last_seen_at is written at most this often, so reads stay cheap. */
const TOUCH_INTERVAL_MS = 60_000;
/** Refresh the Discord access token when it expires within this window. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** What the rest of the dashboard sees of a session: never the Discord tokens. */
export interface ActiveSession {
  /** SHA-256 of the cookie value; safe to log and to use as a cache key. */
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  stepUpAt: Date | null;
}

export interface CreateSessionInput {
  userId: string;
  tokens: DiscordTokenSet;
  ipAddress: string | null;
  userAgent: string | null;
  /** Cookie of the session this login replaces; it is deleted so the ID rotates. */
  replacesToken?: string | undefined;
}

export interface SessionServiceDeps {
  repo: WebSessionRepository;
  vault: SecretVault;
  oauth: Pick<DiscordOAuthClient, 'refresh'>;
  now?: () => Date;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Opaque, revocable dashboard sessions (ADR-013). The cookie holds 32 random bytes; the database
 * stores only their SHA-256 hash, and the Discord tokens are encrypted with the ciphertext bound
 * to the session row.
 */
export class SessionService {
  private readonly now: () => Date;
  private readonly refreshing = new Map<string, Promise<string | null>>();

  constructor(private readonly deps: SessionServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async create(input: CreateSessionInput): Promise<{ token: string; session: ActiveSession }> {
    const now = this.now();
    if (input.replacesToken) {
      await this.deps.repo.delete(hashSessionToken(input.replacesToken));
    }
    // Lazy cleanup: logins are rare enough that no scheduler is needed.
    await this.deps.repo.deleteExpired(now, new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS));

    const token = randomBytes(32).toString('base64url');
    const id = hashSessionToken(token);
    const row = await this.deps.repo.create({
      id,
      userId: input.userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      ...this.encryptTokens(id, input.tokens),
    });
    return { token, session: toActiveSession(row) };
  }

  /** Resolves a cookie to its live session, deleting it once idle or past its absolute expiry. */
  async resolve(token: string): Promise<ActiveSession | null> {
    if (!SESSION_TOKEN_PATTERN.test(token)) return null;
    const id = hashSessionToken(token);
    const row = await this.deps.repo.findById(id);
    if (!row) return null;

    const now = this.now().getTime();
    const idleFor = now - row.lastSeenAt.getTime();
    if (now >= row.expiresAt.getTime() || idleFor >= SESSION_IDLE_TIMEOUT_MS) {
      await this.deps.repo.delete(id);
      return null;
    }
    if (idleFor >= TOUCH_INTERVAL_MS) {
      await this.deps.repo.touch(id, new Date(now));
    }
    return toActiveSession(row);
  }

  async revoke(token: string): Promise<void> {
    await this.deps.repo.delete(hashSessionToken(token));
  }

  /**
   * Returns a usable Discord access token, refreshing it shortly before expiry. Returns null and
   * ends the session when Discord no longer honours the grant (the user deauthorized the app).
   */
  getDiscordAccessToken(session: ActiveSession): Promise<string | null> {
    // Discord rotates refresh tokens, so concurrent refreshes of one session must share a call.
    const pending = this.refreshing.get(session.id);
    if (pending) return pending;
    const request = this.loadAccessToken(session.id).finally(() =>
      this.refreshing.delete(session.id),
    );
    this.refreshing.set(session.id, request);
    return request;
  }

  private async loadAccessToken(id: string): Promise<string | null> {
    const row = await this.deps.repo.findById(id);
    if (!row) return null;

    const now = this.now();
    if (row.discordTokenExpiresAt.getTime() - now.getTime() > TOKEN_REFRESH_MARGIN_MS) {
      return this.deps.vault.decrypt(row.discordAccessToken, tokenContext('access', id));
    }

    const refreshToken = this.deps.vault.decrypt(
      row.discordRefreshToken,
      tokenContext('refresh', id),
    );
    let tokens: DiscordTokenSet;
    try {
      tokens = await this.deps.oauth.refresh(refreshToken, now);
    } catch (error) {
      if (error instanceof DiscordApiError && (error.status === 400 || error.status === 401)) {
        await this.deps.repo.delete(id);
        return null;
      }
      throw error;
    }
    await this.deps.repo.updateDiscordTokens(id, this.encryptTokens(id, tokens));
    return tokens.accessToken;
  }

  private encryptTokens(id: string, tokens: DiscordTokenSet) {
    return {
      discordAccessToken: this.deps.vault.encrypt(tokens.accessToken, tokenContext('access', id)),
      discordRefreshToken: this.deps.vault.encrypt(
        tokens.refreshToken,
        tokenContext('refresh', id),
      ),
      discordTokenExpiresAt: tokens.expiresAt,
    };
  }
}

/** Binds each ciphertext to its column and row, so a copied value fails to decrypt elsewhere. */
function tokenContext(kind: 'access' | 'refresh', sessionId: string): string {
  return `web_sessions.discord_${kind}_token:${sessionId}`;
}

function toActiveSession(row: WebSession): ActiveSession {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    stepUpAt: row.stepUpAt,
  };
}
