import { describe, expect, it, vi } from 'vitest';
import type { UserConsent } from '@ririko/database';
import { AI_CONSENT_VERSION, ConsentService, TERMS_VERSION } from './consent.service.js';

const NOW = new Date('2026-10-17T10:00:00.000Z');

function row(kind: string, version: string): UserConsent {
  return { userId: 'u1', kind, version, acceptedAt: NOW };
}

function setup(found: UserConsent | null = null) {
  const repo = {
    find: vi.fn().mockResolvedValue(found),
    accept: vi.fn().mockResolvedValue(undefined),
    withdraw: vi.fn().mockResolvedValue(true),
  };
  const service = new ConsentService(repo, { now: () => NOW });
  return { repo, service };
}

describe('ConsentService', () => {
  it('owns the current versions: the terms follow the legal texts, the AI consent keeps its own date', () => {
    const { service } = setup();
    expect(TERMS_VERSION).toBe('2026-10-22');
    expect(AI_CONSENT_VERSION).toBe('2026-10-15');
    expect(service.versionOf('terms')).toBe(TERMS_VERSION);
    expect(service.versionOf('ai')).toBe(AI_CONSENT_VERSION);
  });

  it('says a user who never accepted has not accepted', async () => {
    const { service } = setup(null);
    expect(await service.hasAccepted('u1', 'terms')).toBe(false);
  });

  it('accepts only the current version', async () => {
    expect(await setup(row('terms', TERMS_VERSION)).service.hasAccepted('u1', 'terms')).toBe(true);
    expect(await setup(row('terms', '2025-01-01')).service.hasAccepted('u1', 'terms')).toBe(false);
  });

  it('reads the database once per user and kind once the user has accepted', async () => {
    const { repo, service } = setup(row('terms', TERMS_VERSION));

    expect(await service.hasAccepted('u1', 'terms')).toBe(true);
    expect(await service.hasAccepted('u1', 'terms')).toBe(true);
    expect(await service.hasAccepted('u1', 'terms')).toBe(true);

    expect(repo.find).toHaveBeenCalledTimes(1);
  });

  it('keeps asking the database for a user who has not accepted', async () => {
    const { repo, service } = setup(null);

    await service.hasAccepted('u1', 'terms');
    await service.hasAccepted('u1', 'terms');

    expect(repo.find).toHaveBeenCalledTimes(2);
  });

  it('writes the current version with the clock and then skips the database', async () => {
    const { repo, service } = setup(null);

    await service.accept('u1', 'terms');

    expect(repo.accept).toHaveBeenCalledWith('u1', 'terms', TERMS_VERSION, NOW);
    expect(await service.hasAccepted('u1', 'terms')).toBe(true);
    expect(repo.find).not.toHaveBeenCalled();
  });

  it('does not remember an acceptance that failed to save', async () => {
    const { repo, service } = setup(null);
    repo.accept.mockRejectedValueOnce(new Error('disk full'));

    await expect(service.accept('u1', 'terms')).rejects.toThrow('disk full');

    expect(await service.hasAccepted('u1', 'terms')).toBe(false);
  });

  it('forgets a withdrawn consent', async () => {
    const { repo, service } = setup(row('ai', AI_CONSENT_VERSION));
    expect(await service.hasAccepted('u1', 'ai')).toBe(true);

    repo.find.mockResolvedValue(null);
    expect(await service.withdraw('u1', 'ai')).toBe(true);

    expect(repo.withdraw).toHaveBeenCalledWith('u1', 'ai');
    expect(await service.hasAccepted('u1', 'ai')).toBe(false);
  });

  it('reports what the user accepted and when, straight from the database', async () => {
    const current = setup(row('ai', AI_CONSENT_VERSION));
    expect(await current.service.status('u1', 'ai')).toEqual({
      version: AI_CONSENT_VERSION,
      acceptedAt: NOW,
      current: true,
    });
    expect(current.repo.find).toHaveBeenCalledWith('u1', 'ai');

    const older = setup(row('ai', '2025-01-01'));
    expect(await older.service.status('u1', 'ai')).toEqual({
      version: '2025-01-01',
      acceptedAt: NOW,
      current: false,
    });
  });

  it('reports no status for a user who never accepted or withdrew', async () => {
    expect(await setup(null).service.status('u1', 'ai')).toBeNull();
  });

  it('starts the cache over when it is full', async () => {
    const { repo, service } = setup(null);
    const small = new ConsentService(repo, { now: () => NOW, maxCachedUsers: 2 });
    await small.accept('a', 'terms');
    await small.accept('b', 'terms');
    await small.accept('c', 'terms');
    repo.find.mockResolvedValue(null);

    expect(await small.hasAccepted('c', 'terms')).toBe(true);
    expect(await small.hasAccepted('a', 'terms')).toBe(false);
    expect(service.versionOf('terms')).toBe(TERMS_VERSION);
  });
});
