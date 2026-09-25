import { describe, expect, it } from 'vitest';
import { SecretVault } from '@ririko/core';
import {
  OAUTH_STATE_TTL_MS,
  openPendingLogin,
  sealPendingLogin,
  type PendingLogin,
} from './oauth-state';

const vault = new SecretVault({ version: 1, hexKey: 'b'.repeat(64) });
const T0 = new Date('2026-09-25T00:00:00Z');
const login: PendingLogin = {
  state: 'state-123',
  codeVerifier: 'verifier-456',
  returnTo: '/servers',
  issuedAt: T0.getTime(),
};

describe('pending login cookie', () => {
  it('round-trips when the state matches and the cookie is fresh', () => {
    const sealed = sealPendingLogin(vault, login);
    expect(sealed).not.toContain('verifier-456');
    expect(openPendingLogin(vault, sealed, 'state-123', T0)).toEqual(login);
  });

  it('rejects a mismatched state (login CSRF)', () => {
    const sealed = sealPendingLogin(vault, login);
    expect(openPendingLogin(vault, sealed, 'state-999', T0)).toBeNull();
    expect(openPendingLogin(vault, sealed, 'state-1234', T0)).toBeNull();
  });

  it('rejects an expired cookie or one issued in the future', () => {
    const sealed = sealPendingLogin(vault, login);
    const late = new Date(T0.getTime() + OAUTH_STATE_TTL_MS + 1);
    expect(openPendingLogin(vault, sealed, 'state-123', late)).toBeNull();
    const early = new Date(T0.getTime() - 1);
    expect(openPendingLogin(vault, sealed, 'state-123', early)).toBeNull();
  });

  it('rejects tampered cookies and ciphertexts from other contexts', () => {
    const sealed = sealPendingLogin(vault, login);
    expect(openPendingLogin(vault, `${sealed}x`, 'state-123', T0)).toBeNull();
    const foreign = vault.encrypt(JSON.stringify(login), 'another-purpose');
    expect(openPendingLogin(vault, foreign, 'state-123', T0)).toBeNull();
  });
});
