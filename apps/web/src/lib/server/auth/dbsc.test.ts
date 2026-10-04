import { generateKeyPairSync, sign, type JsonWebKey, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SecretVault } from '@ririko/core';
import {
  BOUND_COOKIE,
  BOUND_COOKIE_TTL_MS,
  challengeHeader,
  DBSC_CHALLENGE_TTL_MS,
  openBoundCookie,
  openChallenge,
  registrationHeader,
  safeEqual,
  sealBoundCookie,
  sealChallenge,
  sessionInstructions,
  verifyProof,
} from './dbsc';

const vault = new SecretVault({ version: 1, hexKey: 'b'.repeat(64) });
const T0 = new Date('2026-10-04T00:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const ecOther = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const rsaWeak = generateKeyPairSync('rsa', { modulusLength: 1024 });
const p384 = generateKeyPairSync('ec', { namedCurve: 'P-384' });
const jwkOf = (key: KeyObject) => key.export({ format: 'jwk' });

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

function signJwt(
  alg: 'ES256' | 'RS256',
  key: KeyObject,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): string {
  const input = `${b64({ alg, typ: 'dbsc+jwt', ...header })}.${b64(payload)}`;
  const signature =
    alg === 'ES256'
      ? sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' })
      : sign('RSA-SHA256', Buffer.from(input), key);
  return `${input}.${signature.toString('base64url')}`;
}

describe('DBSC sealed challenges and bound cookies (TASK-1191)', () => {
  it('opens a challenge only for its session and within two minutes', () => {
    const challenge = sealChallenge(vault, 'sid-a', T0);
    expect(openChallenge(vault, challenge, 'sid-a', at(DBSC_CHALLENGE_TTL_MS - 1))).toBe(true);
    expect(openChallenge(vault, challenge, 'sid-b', T0)).toBe(false);
    expect(openChallenge(vault, challenge, 'sid-a', at(DBSC_CHALLENGE_TTL_MS))).toBe(false);
    expect(openChallenge(vault, `${challenge}x`, 'sid-a', T0)).toBe(false);
    expect(openChallenge(vault, 'garbage', 'sid-a', T0)).toBe(false);
  });

  it('keeps challenges and bound cookies apart and expires cookies after ten minutes', () => {
    const cookie = sealBoundCookie(vault, 'sid-a', T0);
    expect(openBoundCookie(vault, cookie, at(BOUND_COOKIE_TTL_MS - 1))).toBe('sid-a');
    expect(openBoundCookie(vault, cookie, at(BOUND_COOKIE_TTL_MS))).toBeNull();
    expect(openChallenge(vault, cookie, 'sid-a', T0)).toBe(false);
    expect(openBoundCookie(vault, sealChallenge(vault, 'sid-a', T0), T0)).toBeNull();
    expect(openBoundCookie(vault, 'v1.a.b.c', T0)).toBeNull();
    expect(openBoundCookie(vault, vault.encrypt('"not an object"', 'dbsc-bound'), T0)).toBeNull();
    expect(openBoundCookie(vault, vault.encrypt('{"sid":1,"exp":2}', 'dbsc-bound'), T0)).toBeNull();
  });

  it('compares strings in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('verifyProof (TASK-1191)', () => {
  const ecJwk = jwkOf(ec.publicKey);

  it('accepts an ES256 registration proof and returns only the public key members', () => {
    const proof = signJwt('ES256', ec.privateKey, { jwk: ecJwk }, { jti: 'challenge-1' });
    expect(verifyProof(proof)).toEqual({
      alg: 'ES256',
      jti: 'challenge-1',
      jwk: { kty: 'EC', crv: 'P-256', x: ecJwk.x, y: ecJwk.y },
    });
  });

  it('accepts an RS256 registration proof', () => {
    const rsaJwk = jwkOf(rsa.publicKey);
    const proof = signJwt('RS256', rsa.privateKey, { jwk: rsaJwk }, { jti: 'challenge-2' });
    expect(verifyProof(proof)).toEqual({
      alg: 'RS256',
      jti: 'challenge-2',
      jwk: { kty: 'RSA', n: rsaJwk.n, e: rsaJwk.e },
    });
  });

  it('verifies a refresh proof against the stored key, not the header key', () => {
    const refresh = signJwt('ES256', ec.privateKey, {}, { jti: 'c' });
    expect(verifyProof(refresh, { publicKey: ecJwk })?.jti).toBe('c');
    expect(verifyProof(refresh)).toBeNull();

    const forged = signJwt(
      'ES256',
      ecOther.privateKey,
      { jwk: jwkOf(ecOther.publicKey) },
      {
        jti: 'c',
      },
    );
    expect(verifyProof(forged, { publicKey: ecJwk })).toBeNull();
  });

  it('rejects a tampered signature or payload', () => {
    const proof = signJwt('ES256', ec.privateKey, { jwk: ecJwk }, { jti: 'c' });
    const [header, , signature] = proof.split('.') as [string, string, string];
    expect(verifyProof(`${header}.${b64({ jti: 'other' })}.${signature}`)).toBeNull();
    const flipped = Buffer.from(signature, 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(
      verifyProof(`${header}.${b64({ jti: 'c' })}.${flipped.toString('base64url')}`),
    ).toBeNull();
    expect(verifyProof(`${header}.${b64({ jti: 'c' })}.${signature.slice(0, 20)}`)).toBeNull();
  });

  it('rejects alg none, other algorithms and a wrong typ', () => {
    const payload = b64({ jti: 'c' });
    expect(
      verifyProof(`${b64({ alg: 'none', typ: 'dbsc+jwt', jwk: ecJwk })}.${payload}.`),
    ).toBeNull();
    expect(
      verifyProof(`${b64({ alg: 'none', typ: 'dbsc+jwt', jwk: ecJwk })}.${payload}.AAAA`),
    ).toBeNull();
    const valid = signJwt('ES256', ec.privateKey, { jwk: ecJwk }, { jti: 'c' });
    const signature = valid.split('.')[2];
    expect(
      verifyProof(`${b64({ alg: 'HS256', typ: 'dbsc+jwt', jwk: ecJwk })}.${payload}.${signature}`),
    ).toBeNull();
    expect(
      verifyProof(`${b64({ alg: 'ES384', typ: 'dbsc+jwt', jwk: ecJwk })}.${payload}.${signature}`),
    ).toBeNull();
    expect(
      verifyProof(signJwt('ES256', ec.privateKey, { jwk: ecJwk, typ: 'JWT' }, { jti: 'c' })),
    ).toBeNull();
  });

  it('rejects a missing, invalid, private or mismatched jwk', () => {
    expect(verifyProof(signJwt('ES256', ec.privateKey, {}, { jti: 'c' }))).toBeNull();
    expect(verifyProof(signJwt('ES256', ec.privateKey, { jwk: 'key' }, { jti: 'c' }))).toBeNull();
    expect(
      verifyProof(signJwt('ES256', ec.privateKey, { jwk: { ...ecJwk, x: 'AAAA' } }, { jti: 'c' })),
    ).toBeNull();
    expect(
      verifyProof(signJwt('ES256', ec.privateKey, { jwk: jwkOf(ec.privateKey) }, { jti: 'c' })),
    ).toBeNull();
    expect(
      verifyProof(signJwt('ES256', ec.privateKey, { jwk: jwkOf(rsa.publicKey) }, { jti: 'c' })),
    ).toBeNull();
    expect(verifyProof(signJwt('RS256', rsa.privateKey, { jwk: ecJwk }, { jti: 'c' }))).toBeNull();
    const p384Jwk: JsonWebKey = jwkOf(p384.publicKey);
    expect(
      verifyProof(signJwt('ES256', p384.privateKey, { jwk: p384Jwk }, { jti: 'c' })),
    ).toBeNull();
    expect(
      verifyProof(
        signJwt('RS256', rsaWeak.privateKey, { jwk: jwkOf(rsaWeak.publicKey) }, { jti: 'c' }),
      ),
    ).toBeNull();
    expect(
      verifyProof(signJwt('ES256', ec.privateKey, {}, { jti: 'c' }), { publicKey: { kty: 'EC' } }),
    ).toBeNull();
  });

  it('rejects a missing jti and malformed tokens without throwing', () => {
    expect(verifyProof(signJwt('ES256', ec.privateKey, { jwk: ecJwk }, {}))).toBeNull();
    expect(verifyProof(signJwt('ES256', ec.privateKey, { jwk: ecJwk }, { jti: 7 }))).toBeNull();
    expect(verifyProof('')).toBeNull();
    expect(verifyProof('a.b')).toBeNull();
    expect(verifyProof('a.b.c.d')).toBeNull();
    expect(verifyProof('a+b.c.d')).toBeNull();
    expect(verifyProof(`${b64([1])}.${b64({ jti: 'c' })}.AAAA`)).toBeNull();
    expect(
      verifyProof(`${Buffer.from('{').toString('base64url')}.${b64({ jti: 'c' })}.AAAA`),
    ).toBeNull();
    expect(verifyProof('A'.repeat(9000))).toBeNull();
    expect(verifyProof(undefined as unknown as string)).toBeNull();
  });
});

describe('DBSC header and instruction builders (TASK-1191)', () => {
  it('builds the registration and challenge headers as structured-field strings', () => {
    expect(registrationHeader('v1.a.b.c')).toBe(
      '(ES256 RS256);path="/api/auth/dbsc/register";challenge="v1.a.b.c"',
    );
    expect(challengeHeader('v1.a.b.c', 'sid_1')).toBe('"v1.a.b.c";id="sid_1"');
    expect(challengeHeader('a"b\\c', 's')).toBe('"a\\"b\\\\c";id="s"');
  });

  it('describes the session scope, refresh path and bound cookie', () => {
    expect(sessionInstructions('sid-1')).toEqual({
      session_identifier: 'sid-1',
      refresh_url: '/api/auth/dbsc/refresh',
      scope: { include_site: false },
      credentials: [
        {
          type: 'cookie',
          name: BOUND_COOKIE,
          attributes: 'Path=/; Secure; HttpOnly; SameSite=Lax',
        },
      ],
    });
    expect(BOUND_COOKIE).toBe('__Host-ririko_bound');
  });
});
