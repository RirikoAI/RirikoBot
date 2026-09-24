import { describe, expect, it } from 'vitest';
import { SecurityError } from '../errors/base.js';
import { SecretVault } from './secret-vault.js';

const KEY_1 = '1'.repeat(64);
const KEY_2 = '2'.repeat(64);

describe('SecretVault', () => {
  it('round-trips plaintext under the current key version', () => {
    const vault = new SecretVault({ version: 3, hexKey: KEY_1 });
    const payload = vault.encrypt('discord-token', 'ctx');
    expect(payload.startsWith('v3.')).toBe(true);
    expect(payload).not.toContain('discord-token');
    expect(vault.decrypt(payload, 'ctx')).toBe('discord-token');
  });

  it('uses a fresh IV for every encryption', () => {
    const vault = new SecretVault({ version: 1, hexKey: KEY_1 });
    expect(vault.encrypt('same')).not.toBe(vault.encrypt('same'));
  });

  it('rejects a tampered ciphertext or auth tag', () => {
    const vault = new SecretVault({ version: 1, hexKey: KEY_1 });
    const [v, iv, tag, data] = vault.encrypt('secret').split('.') as [
      string,
      string,
      string,
      string,
    ];
    const flip = (part: string) => {
      const bytes = Buffer.from(part, 'base64url');
      bytes[0]! ^= 0x01;
      return bytes.toString('base64url');
    };
    expect(() => vault.decrypt([v, iv, tag, flip(data)].join('.'))).toThrow(SecurityError);
    expect(() => vault.decrypt([v, iv, flip(tag), data].join('.'))).toThrow(SecurityError);
  });

  it('rejects a ciphertext replayed under a different context', () => {
    const vault = new SecretVault({ version: 1, hexKey: KEY_1 });
    const payload = vault.encrypt('secret', 'discord-access-token');
    expect(() => vault.decrypt(payload, 'oauth-state')).toThrow(SecurityError);
  });

  it('decrypts data from a previous key after rotation and encrypts with the new key', () => {
    const oldVault = new SecretVault({ version: 1, hexKey: KEY_1 });
    const oldPayload = oldVault.encrypt('legacy');

    const rotated = new SecretVault({ version: 2, hexKey: KEY_2 }, [{ version: 1, hexKey: KEY_1 }]);
    expect(rotated.decrypt(oldPayload)).toBe('legacy');
    expect(rotated.encrypt('fresh').startsWith('v2.')).toBe(true);
  });

  it('rejects unknown key versions and malformed payloads', () => {
    const vault = new SecretVault({ version: 2, hexKey: KEY_2 });
    const foreign = new SecretVault({ version: 1, hexKey: KEY_1 }).encrypt('x');
    expect(() => vault.decrypt(foreign)).toThrow(/No secret vault key for version 1/);
    expect(() => vault.decrypt('not-a-payload')).toThrow(SecurityError);
    expect(() => vault.decrypt('v2.a.b.c.d')).toThrow(SecurityError);
  });

  it('builds from config including previous keys', () => {
    const vault = SecretVault.fromConfig({
      SECRET_VAULT_KEY: KEY_2,
      SECRET_VAULT_KEY_VERSION: 2,
      SECRET_VAULT_PREVIOUS_KEYS: `1:${KEY_1}`,
    });
    const legacy = new SecretVault({ version: 1, hexKey: KEY_1 }).encrypt('old');
    expect(vault.decrypt(legacy)).toBe('old');
    expect(() => SecretVault.fromConfig({ SECRET_VAULT_KEY_VERSION: 1 })).toThrow(SecurityError);
  });

  it('rejects duplicate key versions', () => {
    expect(
      () => new SecretVault({ version: 1, hexKey: KEY_1 }, [{ version: 1, hexKey: KEY_2 }]),
    ).toThrow(/Duplicate/);
  });
});
