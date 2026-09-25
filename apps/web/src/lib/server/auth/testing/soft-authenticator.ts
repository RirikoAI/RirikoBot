import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_BS = 0x10;
const FLAG_AT = 0x40;

const b64 = (bytes: Uint8Array) => isoBase64URL.fromBuffer(new Uint8Array(bytes));
const u32 = (value: number) => {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
};

/**
 * Test-only WebAuthn authenticator: a P-256 key pair that produces real "none" attestation and
 * ES256 assertion responses, so tests exercise the full @simplewebauthn verification.
 */
export class SoftAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  private counter = 0;

  constructor(
    private readonly origin: string,
    private readonly options: {
      synced?: boolean;
      userVerified?: boolean;
      userPresent?: boolean;
    } = {},
  ) {}

  get id(): string {
    return b64(this.credentialId);
  }

  register(challenge: string, origin = this.origin): RegistrationResponseJSON {
    const clientDataJSON = this.clientData('webauthn.create', challenge, origin);
    const authData = Buffer.concat([
      this.header(origin, FLAG_AT),
      Buffer.alloc(16), // AAGUID
      Buffer.from([0, this.credentialId.length]),
      this.credentialId,
      this.coseKey(),
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string | number, string | Uint8Array | Map<string, never>>([
        ['fmt', 'none'],
        ['attStmt', new Map<string, never>()],
        ['authData', new Uint8Array(authData)],
      ]),
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: b64(clientDataJSON),
        attestationObject: b64(attestationObject),
        transports: ['internal'],
      },
      clientExtensionResults: {},
    };
  }

  /** Signs a challenge; `counter` overrides the next signature counter (for replay tests). */
  authenticate(
    challenge: string,
    options: { origin?: string; counter?: number; userPresent?: boolean } = {},
  ): AuthenticationResponseJSON {
    const origin = options.origin ?? this.origin;
    this.counter = options.counter ?? this.counter + 1;
    const clientDataJSON = this.clientData('webauthn.get', challenge, origin);
    const authenticatorData = this.header(origin, 0, options.userPresent);
    const signature = sign(
      'sha256',
      Buffer.concat([authenticatorData, createHash('sha256').update(clientDataJSON).digest()]),
      this.keys.privateKey,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: b64(clientDataJSON),
        authenticatorData: b64(authenticatorData),
        signature: b64(signature),
      },
      clientExtensionResults: {},
    };
  }

  private header(origin: string, extraFlags: number, userPresent?: boolean): Buffer {
    const rpIdHash = createHash('sha256').update(new URL(origin).hostname).digest();
    let flags = extraFlags;
    if ((userPresent ?? this.options.userPresent) !== false) flags |= FLAG_UP;
    if (this.options.userVerified !== false) flags |= FLAG_UV;
    if (this.options.synced) flags |= FLAG_BE | FLAG_BS;
    return Buffer.concat([rpIdHash, Buffer.from([flags]), u32(this.counter)]);
  }

  private clientData(type: string, challenge: string, origin: string): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  private coseKey(): Uint8Array {
    const jwk = this.keys.publicKey.export({ format: 'jwk' });
    return isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, isoBase64URL.toBuffer(jwk.x!)],
        [-3, isoBase64URL.toBuffer(jwk.y!)],
      ]),
    );
  }
}
