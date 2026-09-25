import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { WebKnownDeviceRepository } from '@ririko/database';

/** Random per-browser ID; only its SHA-256 is stored, like the session cookie. */
export const DEVICE_COOKIE = '__Host-ririko_device';
/** The device cookie lasts a year and is renewed at every sign-in. */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface KnownDeviceServiceDeps {
  repo: WebKnownDeviceRepository;
  now?: () => Date;
}

/**
 * Recognizes browsers a user has signed in from before, so a sign-in from any other browser
 * can be reported to the user (ADR-013 detection). Malware that copies the browser profile
 * copies this cookie too, so this is an alert, never an authorization check.
 */
export class KnownDeviceService {
  private readonly now: () => Date;

  constructor(private readonly deps: KnownDeviceServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Records a sign-in by `userId` from the browser holding `cookie` (a new random ID when it has
   * none). Returns the value to store in the device cookie and whether the browser is new to
   * this user.
   */
  async recordSignIn(
    userId: string,
    cookie: string | undefined,
  ): Promise<{ token: string; isNew: boolean }> {
    const now = this.now();
    // Lazy cleanup, as for sessions: devices unseen for a year no longer hold the cookie.
    await this.deps.repo.deleteUnseenSince(
      new Date(now.getTime() - DEVICE_COOKIE_MAX_AGE_SECONDS * 1000),
    );
    const token =
      cookie && DEVICE_TOKEN_PATTERN.test(cookie) ? cookie : randomBytes(32).toString('base64url');
    const deviceHash = createHash('sha256').update(token).digest('hex');
    return { token, isNew: await this.deps.repo.recordSighting(userId, deviceHash, now) };
  }
}
