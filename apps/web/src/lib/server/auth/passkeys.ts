import 'server-only';
import { createHash } from 'node:crypto';
import { SecurityError, ValidationError } from '@ririko/core';
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

/** The passkey could not be verified; the message is safe to show to the user. */
export class PasskeyVerificationError extends SecurityError {
  constructor(message = 'The passkey could not be verified. Please try again.', cause?: unknown) {
    super(message, { userMessage: message, cause: cause instanceof Error ? cause : undefined });
  }
}

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
 * row and consumed once; user verification (biometric or PIN) is required; attestation is not
 * requested because any authenticator the user trusts is accepted.
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
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
    await this.deps.sessions.storeChallenge(session, 'register', options.challenge);
    return options;
  }

  async register(
    session: ActiveSession,
    rawName: unknown,
    rawResponse: unknown,
    actor: PasskeyActor,
  ): Promise<WebPasskey> {
    const name = PasskeyNameSchema.safeParse(rawName);
    if (!name.success) {
      throw new ValidationError(name.error.issues[0]?.message ?? 'Invalid passkey name.');
    }
    const response = RegistrationResponseSchema.safeParse(rawResponse);
    if (!response.success) throw new PasskeyVerificationError();

    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response: response.data as RegistrationResponseJSON,
        expectedChallenge: (challenge) =>
          this.deps.sessions.consumeChallenge(session, 'register', challenge),
        expectedOrigin: this.deps.origin,
        expectedRPID: this.rpID,
        requireUserVerification: true,
      });
    } catch (error) {
      throw new PasskeyVerificationError(undefined, error);
    }
    if (!verification.verified) throw new PasskeyVerificationError();

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
    return passkey;
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
      userVerification: 'required',
    });
    await this.deps.sessions.storeChallenge(session, 'authenticate', options.challenge);
    return options;
  }

  /** Verifies a passkey check for the session's user; throws PasskeyVerificationError. */
  async authenticate(session: ActiveSession, rawResponse: unknown): Promise<void> {
    const response = AuthenticationResponseSchema.safeParse(rawResponse);
    if (!response.success) throw new PasskeyVerificationError();
    const passkey = await this.deps.repo.findForUser(session.userId, response.data.id);
    if (!passkey)
      throw new PasskeyVerificationError('This passkey is not registered to your account.');

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
        requireUserVerification: true,
      });
    } catch (error) {
      // Includes a signature counter that did not increase: a sign of a cloned authenticator.
      throw new PasskeyVerificationError(undefined, error);
    }
    if (!verification.verified) throw new PasskeyVerificationError();

    await this.deps.repo.recordUse(passkey.id, {
      counter: verification.authenticationInfo.newCounter,
      backedUp: verification.authenticationInfo.credentialBackedUp,
      lastUsedAt: this.now(),
    });
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
 * Stable, opaque WebAuthn user handle. The Discord ID is not used directly because user handles
 * should not identify the person to anyone who reads the authenticator.
 */
function webauthnUserId(userId: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash('sha256').update(`ririko-web:${userId}`).digest());
}
