import 'server-only';
import { createHash, randomBytes, type JsonWebKey } from 'node:crypto';
import { SecurityError, type SecretVault } from '@ririko/core';
import type { WebSession, WebSessionPatch, WebSessionRepository } from '@ririko/database';
import {
  openBoundCookie,
  openChallenge,
  safeEqual,
  sealBoundCookie,
  sealChallenge,
  verifyProof,
} from './dbsc';
import { DiscordApiError, type DiscordOAuthClient, type DiscordTokenSet } from './discord-oauth';

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60_000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60_000;
/** last_seen_at is written at most this often, so reads stay cheap. */
const TOUCH_INTERVAL_MS = 60_000;
/** Refresh the Discord access token when it expires within this window. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** DBSC session identifiers are 32 random bytes, base64url, like session tokens. */
const DBSC_SESSION_ID_PATTERN = SESSION_TOKEN_PATTERN;
/** How long a WebAuthn challenge stays valid. */
const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60_000;

export type WebAuthnPurpose = 'register' | 'authenticate';

/** What the rest of the dashboard sees of a session: never the Discord tokens. */
export interface ActiveSession {
  /** SHA-256 of the cookie value; safe to log and to use as a cache key. */
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  stepUpAt: Date | null;
}

/** A session as the user sees it on the active sessions page. */
export interface SessionSummary {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  /** True once the browser bound the session to a device key with DBSC (STORY-119). */
  deviceBound: boolean;
}

/** Outcome of {@link SessionService.bindDevice}. */
export type BindDeviceResult =
  | {
      kind: 'bound';
      /** The rotated session cookie value; the old one no longer resolves. */
      token: string;
      session: ActiveSession;
      /** The new DBSC session identifier (`session_identifier` in the instructions). */
      sid: string;
      /** Value for the bound cookie. */
      boundCookie: string;
    }
  /** No live session for the cookie (or it ended while binding). */
  | { kind: 'no_session' }
  /** The session is already bound; a binding is never replaced. */
  | { kind: 'already_bound' }
  /** The proof is malformed, wrongly signed, or does not answer a fresh challenge. */
  | { kind: 'invalid_proof' };

/** Outcome of {@link SessionService.refreshBinding}. */
export type RefreshBindingResult =
  /** Unknown DBSC session, or its session ended: the browser should end its DBSC session. */
  | { kind: 'unknown' }
  /** No proof, or a proof that does not verify: answer with this new challenge. */
  | { kind: 'challenge'; challenge: string }
  /** A valid proof from the stored key: set this new bound cookie value. */
  | { kind: 'refreshed'; boundCookie: string };

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

  /**
   * Resolves a cookie to its live session, deleting it once idle or past its absolute expiry. A
   * device-bound session (DBSC) also needs a valid, unexpired bound cookie for its DBSC session;
   * without one it does not resolve, but the row stays so the real browser can refresh it.
   */
  async resolve(token: string, boundCookie?: string | null): Promise<ActiveSession | null> {
    if (!SESSION_TOKEN_PATTERN.test(token)) return null;
    const id = hashSessionToken(token);
    const row = await this.deps.repo.findById(id);
    if (!row) return null;

    const now = this.now().getTime();
    if (!isLive(row, now)) {
      await this.deps.repo.delete(id);
      return null;
    }
    if (row.dbscSessionId !== null) {
      const sid = boundCookie ? openBoundCookie(this.deps.vault, boundCookie, new Date(now)) : null;
      if (sid === null || !safeEqual(sid, row.dbscSessionId)) return null;
    }
    if (now - row.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
      await this.deps.repo.touch(id, new Date(now));
    }
    return toActiveSession(row);
  }

  async revoke(token: string): Promise<void> {
    await this.deps.repo.delete(hashSessionToken(token));
  }

  /** The user's live sessions, most recently used first. */
  async listForUser(userId: string): Promise<SessionSummary[]> {
    const now = this.now().getTime();
    const rows = await this.deps.repo.listByUser(userId);
    return rows
      .filter((row) => isLive(row, now))
      .map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        lastSeenAt: row.lastSeenAt,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        deviceBound: row.dbscSessionId !== null,
      }));
  }

  /** Ends one of the user's sessions; false when the ID is unknown or someone else's. */
  revokeForUser(userId: string, sessionId: string): Promise<boolean> {
    return this.deps.repo.deleteForUser(userId, sessionId);
  }

  /** Ends every session of the user except `session`; returns how many ended. */
  revokeOthers(session: ActiveSession): Promise<number> {
    return this.deps.repo.deleteOthersForUser(session.userId, session.id);
  }

  /** Stores the session's pending WebAuthn challenge, replacing any earlier one. */
  async storeChallenge(
    session: ActiveSession,
    purpose: WebAuthnPurpose,
    challenge: string,
  ): Promise<void> {
    const now = this.now().getTime();
    await this.deps.repo.update(session.id, {
      webauthnChallenge: `${purpose}:${challenge}`,
      webauthnChallengeExpiresAt: new Date(now + WEBAUTHN_CHALLENGE_TTL_MS),
    });
  }

  /** True once for a stored, unexpired challenge of that purpose; it cannot be reused. */
  consumeChallenge(
    session: ActiveSession,
    purpose: WebAuthnPurpose,
    challenge: string,
  ): Promise<boolean> {
    return this.deps.repo.consumeChallenge(session.id, `${purpose}:${challenge}`, this.now());
  }

  /**
   * Marks a successful passkey check: records the time and rotates the session ID, so a cookie
   * captured before the check is worthless afterwards. The Discord tokens are re-encrypted
   * because their ciphertexts are bound to the session ID.
   */
  async completePasskeyCheck(
    session: ActiveSession,
  ): Promise<{ token: string; session: ActiveSession }> {
    const row = await this.loadForRotation(session.id);
    if (!row) throw new SecurityError('The session ended before the passkey check completed.');

    const now = this.now();
    const rotated = await this.rotate(row, { stepUpAt: now, lastSeenAt: now });
    if (!rotated) throw new SecurityError('The session ended before the passkey check completed.');
    return {
      token: rotated.token,
      session: { ...toActiveSession(row), id: rotated.id, stepUpAt: now },
    };
  }

  /** A sealed DBSC registration challenge for the session (`Secure-Session-Registration`). */
  registrationChallenge(session: ActiveSession): string {
    return sealChallenge(this.deps.vault, session.id, this.now());
  }

  /**
   * Binds the session of `token` to the device key in a DBSC registration proof. The proof must
   * carry its public key and answer a fresh challenge sealed for this session. The session ID
   * rotates, so a cookie copied before binding is worthless; a bound session is never rebound.
   */
  async bindDevice(token: string, proof: string): Promise<BindDeviceResult> {
    if (!SESSION_TOKEN_PATTERN.test(token)) return { kind: 'no_session' };
    const row = await this.loadForRotation(hashSessionToken(token));
    const now = this.now();
    if (!row || !isLive(row, now.getTime())) return { kind: 'no_session' };
    if (row.dbscSessionId !== null) return { kind: 'already_bound' };

    const verified = verifyProof(proof);
    if (!verified || !openChallenge(this.deps.vault, verified.jti, row.id, now)) {
      return { kind: 'invalid_proof' };
    }

    const sid = randomBytes(32).toString('base64url');
    const rotated = await this.rotate(row, {
      lastSeenAt: now,
      dbscSessionId: sid,
      dbscPublicKey: JSON.stringify(verified.jwk),
    });
    if (!rotated) return { kind: 'no_session' };
    return {
      kind: 'bound',
      token: rotated.token,
      session: { ...toActiveSession(row), id: rotated.id },
      sid,
      boundCookie: sealBoundCookie(this.deps.vault, sid, now),
    };
  }

  /**
   * Answers a DBSC refresh for the DBSC session `sid`: a challenge when there is no proof or it
   * does not verify, a new bound cookie for a proof signed by the stored key over a fresh
   * challenge, and `unknown` when the session no longer exists or is no longer live.
   */
  async refreshBinding(sid: string, proof: string | null): Promise<RefreshBindingResult> {
    if (!DBSC_SESSION_ID_PATTERN.test(sid)) return { kind: 'unknown' };
    const row = await this.deps.repo.findByDbscSessionId(sid);
    const now = this.now();
    if (!row || row.dbscPublicKey === null || !isLive(row, now.getTime())) {
      return { kind: 'unknown' };
    }

    const challenge = (): RefreshBindingResult => ({
      kind: 'challenge',
      challenge: sealChallenge(this.deps.vault, sid, now),
    });
    if (proof === null) return challenge();
    let publicKey: JsonWebKey;
    try {
      publicKey = JSON.parse(row.dbscPublicKey) as JsonWebKey;
    } catch {
      return { kind: 'unknown' };
    }
    const verified = verifyProof(proof, { publicKey });
    if (!verified || !openChallenge(this.deps.vault, verified.jti, sid, now)) return challenge();
    return { kind: 'refreshed', boundCookie: sealBoundCookie(this.deps.vault, sid, now) };
  }

  /** Ends a resolved session, e.g. when Discord rejects its access token. */
  async end(session: ActiveSession): Promise<void> {
    await this.deps.repo.delete(session.id);
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

  /** Loads a row for an ID rotation, after any Discord token refresh in flight for it. */
  private async loadForRotation(id: string): Promise<WebSession | null> {
    // A refresh in flight would write rotated Discord tokens to the old row; let it finish.
    await this.refreshing.get(id)?.catch(() => null);
    return this.deps.repo.findById(id);
  }

  /**
   * Moves the row to a new random session ID and applies `patch`. The Discord tokens are
   * re-encrypted because their ciphertexts are bound to the session ID. Null when the row ended.
   */
  private async rotate(
    row: WebSession,
    patch: WebSessionPatch,
  ): Promise<{ token: string; id: string } | null> {
    const token = randomBytes(32).toString('base64url');
    const id = hashSessionToken(token);
    const moved = await this.deps.repo.update(row.id, {
      ...patch,
      id,
      ...this.encryptTokens(id, {
        accessToken: this.deps.vault.decrypt(
          row.discordAccessToken,
          tokenContext('access', row.id),
        ),
        refreshToken: this.deps.vault.decrypt(
          row.discordRefreshToken,
          tokenContext('refresh', row.id),
        ),
        expiresAt: row.discordTokenExpiresAt,
      }),
    });
    return moved ? { token, id } : null;
  }

  private encryptTokens(
    id: string,
    tokens: Pick<DiscordTokenSet, 'accessToken' | 'refreshToken' | 'expiresAt'>,
  ) {
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

function isLive(row: WebSession, now: number): boolean {
  return now < row.expiresAt.getTime() && now - row.lastSeenAt.getTime() < SESSION_IDLE_TIMEOUT_MS;
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
