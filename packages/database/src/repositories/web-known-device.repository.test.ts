import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import { WebKnownDeviceRepository } from './web-known-device.repository.js';

const at = (days: number) => new Date(Date.UTC(2026, 8, 25) + days * 86_400_000);

describe('WebKnownDeviceRepository (TASK-1172)', () => {
  let client: SqliteDatabaseClient;
  let repo: WebKnownDeviceRepository;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    repo = new WebKnownDeviceRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  const rows = () => client.db.select().from(sqliteSchema.webKnownDevices);

  it('reports a device as new once per user and then updates its last sighting', async () => {
    expect(await repo.recordSighting('user-1', 'device-a', at(0))).toBe(true);
    expect(await repo.recordSighting('user-1', 'device-a', at(3))).toBe(false);
    // The same browser is new for a different account.
    expect(await repo.recordSighting('user-2', 'device-a', at(4))).toBe(true);

    expect(await rows()).toEqual([
      { userId: 'user-1', deviceHash: 'device-a', firstSeenAt: at(0), lastSeenAt: at(3) },
      { userId: 'user-2', deviceHash: 'device-a', firstSeenAt: at(4), lastSeenAt: at(4) },
    ]);
  });

  it('forgets only devices not seen since the cut-off', async () => {
    await repo.recordSighting('user-1', 'old', at(0));
    await repo.recordSighting('user-1', 'recent', at(10));

    expect(await repo.deleteUnseenSince(at(5))).toBe(1);
    expect((await rows()).map((row) => row.deviceHash)).toEqual(['recent']);
    expect(await repo.recordSighting('user-1', 'old', at(11))).toBe(true);
  });
});
