import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ErrorCode } from '../errors/codes.js';
import { SecurityError } from '../errors/base.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface SecretVaultKey {
  version: number;
  /** 32-byte key as a 64-character hex string. */
  hexKey: string;
}

export interface SecretVaultConfig {
  SECRET_VAULT_KEY?: string | undefined;
  SECRET_VAULT_KEY_VERSION: number;
  SECRET_VAULT_PREVIOUS_KEYS?: string | undefined;
}

/**
 * AES-256-GCM encryption for secrets stored at rest (ADR-011).
 *
 * Ciphertext format: `v<version>.<iv>.<tag>.<ciphertext>`, each part base64url. The version
 * selects the key, so the current key can be rotated while data encrypted under a previous key
 * stays readable. The optional `context` is bound as additional authenticated data, so a
 * ciphertext produced for one purpose cannot be replayed as another.
 */
export class SecretVault {
  private readonly keys = new Map<number, Buffer>();
  private readonly currentVersion: number;

  constructor(current: SecretVaultKey, previous: readonly SecretVaultKey[] = []) {
    this.currentVersion = current.version;
    for (const entry of [current, ...previous]) {
      if (this.keys.has(entry.version)) {
        throw new SecurityError(`Duplicate secret vault key version ${entry.version}.`);
      }
      const key = Buffer.from(entry.hexKey, 'hex');
      if (key.length !== KEY_BYTES) {
        throw new SecurityError(`Secret vault key version ${entry.version} must be 32 bytes.`);
      }
      this.keys.set(entry.version, key);
    }
  }

  static fromConfig(config: SecretVaultConfig): SecretVault {
    if (!config.SECRET_VAULT_KEY) {
      throw new SecurityError('SECRET_VAULT_KEY is not configured.', {
        code: ErrorCode.CONFIG_ERROR,
      });
    }
    const previous = (config.SECRET_VAULT_PREVIOUS_KEYS ?? '')
      .split(',')
      .filter(Boolean)
      .map((pair) => {
        const [version, hexKey] = pair.split(':');
        return { version: Number(version), hexKey: hexKey ?? '' };
      });
    return new SecretVault(
      { version: config.SECRET_VAULT_KEY_VERSION, hexKey: config.SECRET_VAULT_KEY },
      previous,
    );
  }

  encrypt(plaintext: string, context = ''): string {
    const key = this.keys.get(this.currentVersion)!;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      `v${this.currentVersion}`,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  /** Throws SecurityError when the payload is malformed, tampered, or under an unknown key. */
  decrypt(payload: string, context = ''): string {
    const [versionPart, ivPart, tagPart, dataPart, ...rest] = payload.split('.');
    const version = Number(versionPart?.startsWith('v') ? versionPart.slice(1) : NaN);
    if (
      !ivPart ||
      !tagPart ||
      dataPart === undefined ||
      rest.length > 0 ||
      !Number.isInteger(version)
    ) {
      throw new SecurityError('Malformed encrypted secret.');
    }
    const key = this.keys.get(version);
    if (!key) {
      throw new SecurityError(`No secret vault key for version ${version}.`);
    }
    const iv = Buffer.from(ivPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new SecurityError('Malformed encrypted secret.');
    }
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(Buffer.from(dataPart, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new SecurityError('Encrypted secret failed authentication.', {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }
}
