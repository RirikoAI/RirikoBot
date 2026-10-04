import 'server-only';
import {
  createPublicKey,
  timingSafeEqual,
  verify,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';
import type { SecretVault } from '@ririko/core';

/**
 * Device Bound Session Credentials (DBSC, W3C webappsec-dbsc) protocol helpers (STORY-119).
 *
 * The browser keeps a private key (in the TPM on Windows) and proves possession of it with a
 * `dbsc+jwt` signed over a server challenge. Challenges and the short-lived bound cookie are
 * vault-sealed `{ sid, exp }` values, so neither needs database state.
 */

/** Short-lived cookie that proves the browser still holds the session's DBSC key. */
export const BOUND_COOKIE = '__Host-ririko_bound';
export const DBSC_REGISTER_PATH = '/api/auth/dbsc/register';
export const DBSC_REFRESH_PATH = '/api/auth/dbsc/refresh';
/** How long a sealed challenge can be answered. */
export const DBSC_CHALLENGE_TTL_MS = 2 * 60_000;
/** How long a bound cookie stays valid before the browser must refresh it with a proof. */
export const BOUND_COOKIE_TTL_MS = 10 * 60_000;
/** Signature algorithms offered at registration, in order of preference. */
export const DBSC_ALGORITHMS = ['ES256', 'RS256'] as const;
export type DbscAlgorithm = (typeof DBSC_ALGORITHMS)[number];

const CHALLENGE_CONTEXT = 'dbsc-challenge';
const BOUND_CONTEXT = 'dbsc-bound';
const BASE64URL = /^[A-Za-z0-9_-]+$/;
/** Longest proof accepted; an RSA-4096 key and signature fit well within it. */
const MAX_PROOF_LENGTH = 8192;
const MIN_RSA_MODULUS_BITS = 2048;
const ES256_SIGNATURE_BYTES = 64;

interface Sealed {
  sid: string;
  exp: number;
}

/** A verified proof: the challenge it answers and the public key (public members only). */
export interface DbscProof {
  alg: DbscAlgorithm;
  jti: string;
  jwk: JsonWebKey;
}

export interface VerifyProofOptions {
  /** The stored key for a refresh proof. Without it, the key comes from the `jwk` header. */
  publicKey?: JsonWebKey | undefined;
}

/** Session instructions JSON returned by the registration endpoint. */
export interface DbscSessionInstructions {
  session_identifier: string;
  refresh_url: string;
  scope: { include_site: false };
  credentials: { type: 'cookie'; name: string; attributes: string }[];
}

function seal(vault: SecretVault, context: string, sid: string, exp: number): string {
  return vault.encrypt(JSON.stringify({ sid, exp } satisfies Sealed), context);
}

function open(vault: SecretVault, context: string, value: string, now: Date): Sealed | null {
  let sealed: unknown;
  try {
    sealed = JSON.parse(vault.decrypt(value, context));
  } catch {
    return null;
  }
  if (
    typeof sealed !== 'object' ||
    sealed === null ||
    typeof (sealed as Sealed).sid !== 'string' ||
    typeof (sealed as Sealed).exp !== 'number'
  ) {
    return null;
  }
  const { sid, exp } = sealed as Sealed;
  return now.getTime() < exp ? { sid, exp } : null;
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A challenge for `sid` (the row ID at registration, the DBSC session ID at refresh). */
export function sealChallenge(vault: SecretVault, sid: string, now: Date): string {
  return seal(vault, CHALLENGE_CONTEXT, sid, now.getTime() + DBSC_CHALLENGE_TTL_MS);
}

/** True when `value` is an authentic, unexpired challenge sealed for `sid`. */
export function openChallenge(vault: SecretVault, value: string, sid: string, now: Date): boolean {
  const sealed = open(vault, CHALLENGE_CONTEXT, value, now);
  return sealed !== null && safeEqual(sealed.sid, sid);
}

/** A bound cookie value for the DBSC session `sid`. */
export function sealBoundCookie(vault: SecretVault, sid: string, now: Date): string {
  return seal(vault, BOUND_CONTEXT, sid, now.getTime() + BOUND_COOKIE_TTL_MS);
}

/** The DBSC session ID of an authentic, unexpired bound cookie, or null. */
export function openBoundCookie(vault: SecretVault, value: string, now: Date): string | null {
  return open(vault, BOUND_CONTEXT, value, now)?.sid ?? null;
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';

/**
 * The public members of a JWK that fits `alg`, or null. Keys with private members are refused:
 * a browser never sends one, and storing one would be a secret at rest.
 */
function publicJwk(alg: DbscAlgorithm, jwk: unknown): JsonWebKey | null {
  if (typeof jwk !== 'object' || jwk === null || Array.isArray(jwk)) return null;
  const key = jwk as Record<string, unknown>;
  if (['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'].some((member) => member in key)) return null;
  if (alg === 'ES256') {
    if (key.kty !== 'EC' || key.crv !== 'P-256' || !isString(key.x) || !isString(key.y)) {
      return null;
    }
    return { kty: 'EC', crv: 'P-256', x: key.x, y: key.y };
  }
  if (key.kty !== 'RSA' || !isString(key.n) || !isString(key.e)) return null;
  return { kty: 'RSA', n: key.n, e: key.e };
}

function importKey(alg: DbscAlgorithm, jwk: JsonWebKey): KeyObject | null {
  let key: KeyObject;
  try {
    key = createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    return null;
  }
  if (alg === 'RS256') {
    const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
    return key.asymmetricKeyType === 'rsa' && bits >= MIN_RSA_MODULUS_BITS ? key : null;
  }
  return key.asymmetricKeyType === 'ec' ? key : null;
}

/**
 * Verifies a `dbsc+jwt` proof with `node:crypto`. Returns the challenge (`jti`) and the key, or
 * null for anything malformed, unsupported or wrongly signed; it never throws. The caller checks
 * that `jti` is a challenge it issued for the expected session.
 */
export function verifyProof(jwt: string, options: VerifyProofOptions = {}): DbscProof | null {
  if (typeof jwt !== 'string' || jwt.length > MAX_PROOF_LENGTH) return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  if (![headerPart, payloadPart, signaturePart].every((part) => BASE64URL.test(part))) return null;

  const header = decodeJson(headerPart);
  const payload = decodeJson(payloadPart);
  if (!header || !payload) return null;
  if (header.typ !== 'dbsc+jwt') return null;
  const alg = header.alg;
  if (alg !== 'ES256' && alg !== 'RS256') return null;
  if (!isString(payload.jti)) return null;

  const jwk = publicJwk(alg, options.publicKey ?? header.jwk);
  if (!jwk) return null;
  const key = importKey(alg, jwk);
  if (!key) return null;

  const signature = Buffer.from(signaturePart, 'base64url');
  const data = Buffer.from(`${headerPart}.${payloadPart}`, 'ascii');
  let valid: boolean;
  try {
    valid =
      alg === 'ES256'
        ? signature.length === ES256_SIGNATURE_BYTES &&
          verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, signature)
        : verify('RSA-SHA256', data, key, signature);
  } catch {
    return null;
  }
  return valid ? { alg, jti: payload.jti, jwk } : null;
}

/** Escapes a value as a structured-field string (RFC 8941 sf-string). */
function sfString(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

/** `Secure-Session-Registration` header value offering the supported algorithms. */
export function registrationHeader(challenge: string): string {
  return `(${DBSC_ALGORITHMS.join(' ')});path=${sfString(DBSC_REGISTER_PATH)};challenge=${sfString(challenge)}`;
}

/** `Secure-Session-Challenge` header value for the DBSC session `sid`. */
export function challengeHeader(challenge: string, sid: string): string {
  return `${sfString(challenge)};id=${sfString(sid)}`;
}

/** Session instructions for the DBSC session `sid`: refresh path, scope and bound cookie. */
export function sessionInstructions(sid: string): DbscSessionInstructions {
  return {
    session_identifier: sid,
    refresh_url: DBSC_REFRESH_PATH,
    scope: { include_site: false },
    credentials: [
      {
        type: 'cookie',
        name: BOUND_COOKIE,
        attributes: 'Path=/; Secure; HttpOnly; SameSite=Lax',
      },
    ],
  };
}
