import 'server-only';
import { createHash } from 'node:crypto';
import type { AuditLogRepository, WebPasskey, WebPasskeyRepository } from '@ririko/database';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { z } from 'zod';
import type { ActiveSession, SessionService } from './session-service';

const RP_NAME = 'Ririko Dashboard';
export const PASSKEY_NAME_MAX_LENGTH = 64;

/** Browser-supplied WebAuthn results are untrusted: check their shape before verifying. */
const credentialShape = {
  id: z.string().min(1).max(1024),
  rawId: z.string().min(1).max(1024),
  type: z.literal('public-key'),
  clientExtensionResults: z.object({}).passthrough(),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
};
const RegistrationResponseSchema = z.object({
  ...credentialShape,
  response: z
    .object({
      clientDataJSON: z.string().max(4096),
      attestationObject: z.string().max(16384),
      transports: z.array(z.string().max(32)).max(8).optional(),
    })
    .passthrough(),
});
const AuthenticationResponseSchema = z.object({
  ...credentialShape,
  response: z
    .object({
      clientDataJSON: z.string().max(4096),
      authenticatorData: z.string().max(4096),
      signature: z.string().max(1024),
      userHandle: z.string().max(256).optional(),
    })
    .passthrough(),
});

export const PasskeyNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the passkey a name, e.g. "Laptop" or "Phone".')
  .max(PASSKEY_NAME_MAX_LENGTH, `Passkey names are at most ${PASSKEY_NAME_MAX_LENGTH} characters.`);

const VERIFICATION_FAILED = 'The passkey could not be verified. Please try again.';

/**
 * Outcome of a passkey ceremony. Failures are returned, not thrown: an error class can exist in
 * more than one module instance (bundler layers, hot reload), so `instanceof` checks in callers
 * are not reliable. `message` is safe to show to the user.
 */
export type PasskeyOutcome<T> = { ok: true; value: T } | { ok: false; message: string };

export interface PasskeyActor {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface PasskeyServiceDeps {
  repo: WebPasskeyRepository;
  sessions: Pick<SessionService, 'storeChallenge' | 'consumeChallenge'>;
  audit: AuditLogRepository;
  /** Public origin of the dashboard, e.g. https://dash.example.com. */
  origin: string;
  now?: () => Date;
}

/**
 * WebAuthn passkey enrollment and verification (ADR-013). Challenges are stored on the session
 * row and consumed once; attestation is not requested because any authenticator the user trusts
 * is accepted.
 *
 * User verification (biometric or PIN) is requested but not required, while user presence is.
 * The passkey is a second factor after Discord sign-in: a stolen cookie or Discord account still
 * cannot pass without the authenticator. Some authenticators, including passkey providers used
 * through Edge, answer without the verification flag, and requiring it rejected them
 * (BUG-0020).
 */
export class PasskeyService {
  private readonly rpID: string;
  private readonly now: () => Date;

  constructor(private readonly deps: PasskeyServiceDeps) {
    this.rpID = new URL(deps.origin).hostname;
    this.now = deps.now ?? (() => new Date());
  }

  list(userId: string): Promise<WebPasskey[]> {
    return this.deps.repo.listByUser(userId);
  }

  count(userId: string): Promise<number> {
    return this.deps.repo.countByUser(userId);
  }

  async registrationOptions(
    session: ActiveSession,
    user: { name: string; displayName: string },
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const existing = await this.deps.repo.listByUser(session.userId);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: this.rpID,
      userName: user.name,
      userDisplayName: user.displayName,
      userID: webauthnUserId(session.userId),
      attestationType: 'none',
      excludeCredentials: existing.map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports,
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    await this.deps.sessions.storeChallenge(session, 'register', options.challenge);
    return options;
  }

  async register(
    session: ActiveSession,
    rawName: unknown,
    rawResponse: unknown,
    actor: PasskeyActor,
  ): Promise<PasskeyOutcome<WebPasskey>> {
    const name = PasskeyNameSchema.safeParse(rawName);
    if (!name.success) {
      return { ok: false, message: name.error.issues[0]?.message ?? 'Invalid passkey name.' };
    }
    const response = RegistrationResponseSchema.safeParse(rawResponse);
    if (!response.success) return rejected('registration', session, shapeProblem(response.error));

    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response: response.data as RegistrationResponseJSON,
        expectedChallenge: (challenge) =>
          this.deps.sessions.consumeChallenge(session, 'register', challenge),
        expectedOrigin: this.deps.origin,
        expectedRPID: this.rpID,
        requireUserVerification: false,
      });
    } catch (error) {
      return rejected('registration', session, error);
    }
    if (!verification.verified) return rejected('registration', session, 'not verified');

    const info = verification.registrationInfo;
    const now = this.now();
    const passkey = await this.deps.repo.create({
      id: info.credential.id,
      userId: session.userId,
      name: name.data,
      publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
      counter: info.credential.counter,
      transports: info.credential.transports ?? [],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      createdAt: now,
    });
    await this.audit(
      session.userId,
      'web.passkey.add',
      { passkeyId: passkey.id, name: passkey.name },
      actor,
      now,
    );
    return { ok: true, value: passkey };
  }

  /** Options for a passkey check, or null when the user has no passkey. */
  async authenticationOptions(
    session: ActiveSession,
  ): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
    const passkeys = await this.deps.repo.listByUser(session.userId);
    if (passkeys.length === 0) return null;
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports,
      })),
      userVerification: 'preferred',
    });
    await this.deps.sessions.storeChallenge(session, 'authenticate', options.challenge);
    return options;
  }

  /** Verifies a passkey check for the session's user. */
  async authenticate(session: ActiveSession, rawResponse: unknown): Promise<PasskeyOutcome<null>> {
    const response = AuthenticationResponseSchema.safeParse(rawResponse);
    if (!response.success) return rejected('check', session, shapeProblem(response.error));
    const passkey = await this.deps.repo.findForUser(session.userId, response.data.id);
    if (!passkey) {
      return rejected(
        'check',
        session,
        'unknown credential',
        'This passkey is not registered to your account.',
      );
    }

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response: response.data as AuthenticationResponseJSON,
        expectedChallenge: (challenge) =>
          this.deps.sessions.consumeChallenge(session, 'authenticate', challenge),
        expectedOrigin: this.deps.origin,
        expectedRPID: this.rpID,
        credential: {
          id: passkey.id,
          publicKey: isoBase64URL.toBuffer(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports,
        },
        requireUserVerification: false,
      });
    } catch (error) {
      // Includes a signature counter that did not increase: a sign of a cloned authenticator.
      return rejected('check', session, error);
    }
    if (!verification.verified) return rejected('check', session, 'signature not verified');

    await this.deps.repo.recordUse(passkey.id, {
      counter: verification.authenticationInfo.newCounter,
      backedUp: verification.authenticationInfo.credentialBackedUp,
      lastUsedAt: this.now(),
    });
    return { ok: true, value: null };
  }

  /** Removes one of the user's passkeys. Callers must require a fresh passkey check first. */
  async remove(userId: string, passkeyId: string, actor: PasskeyActor): Promise<WebPasskey | null> {
    const passkey = await this.deps.repo.findForUser(userId, passkeyId);
    if (!passkey || !(await this.deps.repo.deleteForUser(userId, passkeyId))) return null;
    const remaining = await this.deps.repo.countByUser(userId);
    await this.audit(
      userId,
      'web.passkey.remove',
      { passkeyId, name: passkey.name, remaining },
      actor,
      this.now(),
    );
    return passkey;
  }

  private async audit(
    userId: string,
    action: string,
    details: Record<string, unknown>,
    actor: PasskeyActor,
    now: Date,
  ): Promise<void> {
    await this.deps.audit.create(
      {
        guildId: null,
        actorUserId: userId,
        action,
        details: { source: 'dashboard', ...details },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      now,
    );
  }
}

/**
 * Logs why a passkey was rejected and returns the failed outcome. The user sees a generic
 * message; operators need the real reason (wrong origin, missing user verification, counter
 * rollback, signature) to tell an attack from a misconfiguration.
 */
function rejected(
  ceremony: 'registration' | 'check',
  session: ActiveSession,
  cause: unknown,
  message = VERIFICATION_FAILED,
): { ok: false; message: string } {
  const reason = cause instanceof Error ? cause.message : String(cause);
  console.warn(
    `[web] Passkey ${ceremony} rejected for user ${session.userId}: ${reason.slice(0, 300)}`,
  );
  return { ok: false, message };
}

/** Field paths and messages of a malformed browser response, without the submitted values. */
function shapeProblem(error: z.ZodError): string {
  return `malformed response (${error.issues
    .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    .join('; ')})`;
}

/**
 * Stable, opaque WebAuthn user handle. The Discord ID is not used directly because user handles
 * should not identify the person to anyone who reads the authenticator.
 */
function webauthnUserId(userId: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash('sha256').update(`ririko-web:${userId}`).digest());
}
