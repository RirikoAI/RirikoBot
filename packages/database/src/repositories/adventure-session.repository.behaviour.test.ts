import { expect, it } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import {
  AdventureSessionRepository,
  type StoredAdventureSession,
} from './adventure-session.repository.js';

const session = (
  id: string,
  overrides: Partial<StoredAdventureSession> = {},
): StoredAdventureSession => ({
  id,
  userId: 'u1',
  guildId: 'g1',
  channelId: 'c1',
  revision: 0,
  status: 'ACTIVE',
  deadline: 1_000,
  startedAt: 100,
  deliveredRevision: -1,
  ...overrides,
});

describeDialects('AdventureSessionRepository', (db) => {
  const open = () => new AdventureSessionRepository<StoredAdventureSession>(db.client);

  async function store(
    repo: AdventureSessionRepository<StoredAdventureSession>,
    state: StoredAdventureSession,
  ) {
    await repo.create(state, db.client);
  }

  it('defaults energy to enabled and stores a per-guild setting', async () => {
    const repo = open();
    expect(await repo.getSettings('g1')).toEqual({ energyEnabled: true });

    await repo.setSettings('g1', { energyEnabled: false });
    expect(await repo.getSettings('g1')).toEqual({ energyEnabled: false });
    expect(await repo.getSettings('g2')).toEqual({ energyEnabled: true });

    await repo.setSettings('g1', { energyEnabled: true });
    expect(await repo.getSettings('g1')).toEqual({ energyEnabled: true });
  });

  it('rejects a non-boolean energy setting', async () => {
    const repo = open();

    await expect(
      repo.setSettings('g1', { energyEnabled: 'yes' as unknown as boolean }),
    ).rejects.toThrow('energyEnabled must be a boolean');
  });

  it('creates a player row on first use and reads the cooldowns inside the transaction', async () => {
    const repo = open();

    const first = await repo.withUser('u1', async (tx, cooldownUntil, lastStartAt) => {
      await repo.setCooldown('u1', 5_000, tx);
      await repo.setLastStart('u1', 4_000, tx);
      return { cooldownUntil, lastStartAt };
    });
    expect(first).toEqual({ cooldownUntil: 0, lastStartAt: 0 });

    const second = await repo.withUser('u1', async (_tx, cooldownUntil, lastStartAt) => ({
      cooldownUntil,
      lastStartAt,
    }));
    expect(second).toEqual({ cooldownUntil: 5_000, lastStartAt: 4_000 });

    const other = await repo.withUser('u2', async (_tx, cooldownUntil) => cooldownUntil);
    expect(other).toBe(0);
  });

  it('rolls back the cooldown when the user work fails', async () => {
    const repo = open();

    await expect(
      repo.withUser('u1', async (tx) => {
        await repo.setCooldown('u1', 9_000, tx);
        throw new Error('settle failed');
      }),
    ).rejects.toThrow('settle failed');

    expect(await repo.withUser('u1', async (_tx, cooldownUntil) => cooldownUntil)).toBe(0);
  });

  it('stores a session and finds it by id, as the active one and as the latest', async () => {
    const repo = open();
    expect(await repo.findById('s1')).toBeNull();
    expect(await repo.findActive('u1')).toBeNull();
    expect(await repo.findLatest('u1')).toBeNull();

    const state = session('s1');
    await store(repo, state);

    expect(await repo.findById('s1')).toEqual(state);
    expect(await repo.findActive('u1')).toEqual(state);
    expect(await repo.findLatest('u1')).toEqual(state);
    expect(await repo.findActive('u2')).toBeNull();
  });

  it('treats only active and settling sessions as active and returns the newest as latest', async () => {
    const repo = open();
    await store(repo, session('old', { status: 'COMPLETED', startedAt: 100 }));
    await store(repo, session('newer', { status: 'COMPLETED', startedAt: 300 }));
    expect(await repo.findActive('u1')).toBeNull();
    expect((await repo.findLatest('u1'))?.id).toBe('newer');

    await store(repo, session('now', { status: 'SETTLING', startedAt: 200 }));
    expect((await repo.findActive('u1'))?.id).toBe('now');
    expect((await repo.findLatest('u1'))?.id).toBe('newer');
  });

  it('allows only one active session per user', async () => {
    const repo = open();
    await store(repo, session('a'));

    await expect(store(repo, session('b'))).rejects.toThrow();
    await store(repo, session('c', { userId: 'u2' }));
  });

  it('saves a new revision only when the expected revision still matches', async () => {
    const repo = open();
    await store(repo, session('s1'));

    const next = session('s1', { revision: 1, status: 'SETTLING', deadline: 2_000 });
    await repo.save(next, 0, db.client);
    expect(await repo.findById('s1')).toEqual(next);

    await expect(repo.save(session('s1', { revision: 2 }), 0, db.client)).rejects.toThrow(
      'Adventure revision conflict',
    );
    await expect(repo.save(session('missing', { revision: 1 }), 0, db.client)).rejects.toThrow(
      'Adventure revision conflict',
    );
  });

  it('records one receipt per session revision', async () => {
    const repo = open();
    await store(repo, session('s1'));

    await repo.recordChoice('s1', 1, { choice: 'left' }, db.client);
    await repo.recordChoice('s1', 2, { choice: 'right' }, db.client);
    await expect(repo.recordChoice('s1', 1, { choice: 'again' }, db.client)).rejects.toThrow();
  });

  it('rejects a stored state that disagrees with its row columns', async () => {
    const repo = open();
    await store(repo, session('s1'));
    const tampered = JSON.stringify(session('s1', { revision: 9 }));
    if (db.client.dialect === 'sqlite') {
      db.client.raw
        .prepare('UPDATE adventure_sessions SET payload = ? WHERE id = ?')
        .run(tampered, 's1');
    } else {
      await db.client.raw.query('UPDATE adventure_sessions SET payload = $1 WHERE id = $2', [
        tampered,
        's1',
      ]);
    }

    await expect(repo.findById('s1')).rejects.toThrow('Inconsistent adventure state s1');
  });

  it('runs the state validator on every decoded session', async () => {
    const validated: string[] = [];
    const repo = new AdventureSessionRepository<StoredAdventureSession>(db.client, (state) => {
      validated.push(state.id);
      if (state.channelId === 'bad') throw new Error('invalid state');
    });
    await store(repo, session('s1'));
    await store(repo, session('s2', { userId: 'u2', channelId: 'bad' }));

    expect((await repo.findById('s1'))?.id).toBe('s1');
    expect(validated).toEqual(['s1']);
    await expect(repo.findById('s2')).rejects.toThrow('invalid state');
  });

  it('lists sessions whose latest revision was not delivered, after a cursor', async () => {
    const repo = open();
    await store(repo, session('a', { userId: 'u1', revision: 1, deliveredRevision: 1 }));
    await store(repo, session('b', { userId: 'u2', revision: 2, deliveredRevision: 1 }));
    await store(repo, session('c', { userId: 'u3', revision: 0, deliveredRevision: -1 }));
    await store(repo, session('d', { userId: 'u4', revision: 3, deliveredRevision: 0 }));

    expect((await repo.listUndelivered()).map((s) => s.id)).toEqual(['b', 'c', 'd']);
    expect((await repo.listUndelivered('b')).map((s) => s.id)).toEqual(['c', 'd']);
    expect((await repo.listUndelivered('', 2)).map((s) => s.id)).toEqual(['b', 'c']);
    expect(await repo.listUndelivered('d')).toEqual([]);
  });

  it('lists settling sessions and active sessions past their deadline for recovery', async () => {
    const repo = open();
    await store(repo, session('a', { userId: 'u1', status: 'ACTIVE', deadline: 500 }));
    await store(repo, session('b', { userId: 'u2', status: 'ACTIVE', deadline: 5_000 }));
    await store(repo, session('c', { userId: 'u3', status: 'SETTLING', deadline: 9_000 }));
    await store(repo, session('d', { userId: 'u4', status: 'COMPLETED', deadline: 1 }));

    expect((await repo.listRecoverable(1_000)).map((s) => s.id)).toEqual(['a', 'c']);
    expect((await repo.listRecoverable(1_000, 'a')).map((s) => s.id)).toEqual(['c']);
    expect((await repo.listRecoverable(1_000, '', 1)).map((s) => s.id)).toEqual(['a']);
    expect((await repo.listRecoverable(5_000)).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});
