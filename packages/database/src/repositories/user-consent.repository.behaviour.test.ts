import { expect, it } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import { UserConsentRepository } from './user-consent.repository.js';

const T1 = new Date('2026-10-17T10:00:00.000Z');
const T2 = new Date('2026-11-01T08:30:00.000Z');

describeDialects('UserConsentRepository behaviour', (db) => {
  it('finds nothing for a user who never accepted', async () => {
    const repo = new UserConsentRepository(db.client);
    expect(await repo.find('u1', 'terms')).toBeNull();
  });

  it('records an acceptance with its version and time', async () => {
    const repo = new UserConsentRepository(db.client);
    await repo.accept('u1', 'terms', '2026-10-15', T1);

    expect(await repo.find('u1', 'terms')).toEqual({
      userId: 'u1',
      kind: 'terms',
      version: '2026-10-15',
      acceptedAt: T1,
    });
  });

  it('keeps one row per user and kind, and a newer version replaces the older one', async () => {
    const repo = new UserConsentRepository(db.client);
    await repo.accept('u1', 'terms', '2026-10-15', T1);
    await repo.accept('u1', 'ai', '2026-10-15', T1);
    await repo.accept('u1', 'terms', '2026-12-01', T2);

    expect(await repo.find('u1', 'terms')).toMatchObject({ version: '2026-12-01', acceptedAt: T2 });
    expect(await repo.find('u1', 'ai')).toMatchObject({ version: '2026-10-15', acceptedAt: T1 });
  });

  it('keeps users apart', async () => {
    const repo = new UserConsentRepository(db.client);
    await repo.accept('u1', 'terms', '2026-10-15', T1);

    expect(await repo.find('u2', 'terms')).toBeNull();
  });

  it('withdraws one kind and says whether there was a record', async () => {
    const repo = new UserConsentRepository(db.client);
    await repo.accept('u1', 'terms', '2026-10-15', T1);
    await repo.accept('u1', 'ai', '2026-10-15', T1);

    expect(await repo.withdraw('u1', 'ai')).toBe(true);
    expect(await repo.withdraw('u1', 'ai')).toBe(false);
    expect(await repo.find('u1', 'ai')).toBeNull();
    expect(await repo.find('u1', 'terms')).not.toBeNull();
  });
});
