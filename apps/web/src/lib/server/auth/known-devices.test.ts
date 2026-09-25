import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  WebKnownDeviceRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { DEVICE_COOKIE_MAX_AGE_SECONDS, KnownDeviceService } from './known-devices';

const T0 = new Date('2026-09-25T00:00:00Z').getTime();

describe('KnownDeviceService (TASK-1172)', () => {
  let client: SqliteDatabaseClient;
  let now: number;
  let service: KnownDeviceService;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    now = T0;
    service = new KnownDeviceService({
      repo: new WebKnownDeviceRepository(client),
      now: () => new Date(now),
    });
  });

  afterEach(async () => {
    await client.close();
  });

  it('issues a random device ID to a new browser and recognizes it afterwards', async () => {
    const first = await service.recordSignIn('user-1', undefined);
    expect(first).toEqual({ token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), isNew: true });

    expect(await service.recordSignIn('user-1', first.token)).toEqual({
      token: first.token,
      isNew: false,
    });
    // Another account signing in on the same browser is new for that account.
    expect((await service.recordSignIn('user-2', first.token)).isNew).toBe(true);
  });

  it('replaces malformed cookies and treats them as a new browser', async () => {
    const result = await service.recordSignIn('user-1', 'not-a-device-id');
    expect(result.token).not.toBe('not-a-device-id');
    expect(result.isNew).toBe(true);
  });

  it('forgets a browser once its cookie would have expired', async () => {
    const { token } = await service.recordSignIn('user-1', undefined);
    now = T0 + DEVICE_COOKIE_MAX_AGE_SECONDS * 1000 + 1;
    expect((await service.recordSignIn('user-1', token)).isNew).toBe(true);
  });
});
