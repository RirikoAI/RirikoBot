import { expect, it } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import { WebKnownDeviceRepository } from './web-known-device.repository.js';

const T0 = new Date('2026-09-25T00:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * 86_400_000);

describeDialects('WebKnownDeviceRepository behaviour', (db) => {
  it('reports only the first sighting of a device for a user', async () => {
    const repo = new WebKnownDeviceRepository(db.client);

    expect(await repo.recordSighting('u1', 'hash-a', at(0))).toBe(true);
    expect(await repo.recordSighting('u1', 'hash-a', at(1))).toBe(false);
    expect(await repo.recordSighting('u1', 'hash-b', at(1))).toBe(true);
    expect(await repo.recordSighting('u2', 'hash-a', at(1))).toBe(true);
  });

  it('refreshes the last seen time on a repeat sighting, so it survives a clean-up', async () => {
    const repo = new WebKnownDeviceRepository(db.client);
    await repo.recordSighting('u1', 'seen-again', at(0));
    await repo.recordSighting('u1', 'stale', at(0));
    await repo.recordSighting('u1', 'seen-again', at(10));

    expect(await repo.deleteUnseenSince(at(5))).toBe(1);
    expect(await repo.recordSighting('u1', 'seen-again', at(11))).toBe(false);
    expect(await repo.recordSighting('u1', 'stale', at(11))).toBe(true);
  });

  it('forgets nothing when every device was seen recently', async () => {
    const repo = new WebKnownDeviceRepository(db.client);
    await repo.recordSighting('u1', 'hash-a', at(3));

    expect(await repo.deleteUnseenSince(at(1))).toBe(0);
    expect(await repo.deleteUnseenSince(at(3))).toBe(0);
    expect(await repo.deleteUnseenSince(at(4))).toBe(1);
  });
});
