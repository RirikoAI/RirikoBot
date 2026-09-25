import { describe, expect, it, vi } from 'vitest';
import { UserDirectory } from './user-directory';

const ALICE = '200000000000000001';
const BOB = '200000000000000002';

describe('UserDirectory (TASK-1132)', () => {
  it('looks up snowflakes once, skips other IDs and caches unknown users', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const get = vi.fn(async (route: string) => {
      if (route.endsWith(ALICE)) {
        return { id: ALICE, username: 'alice', global_name: 'Alice', avatar: null };
      }
      throw new Error('Unknown User');
    });
    const directory = new UserDirectory({ get } as never, () => 0);

    const users = await directory.lookup([ALICE, ALICE, BOB, 'cli:admin', 'AUTOMOD']);
    expect([...users.keys()]).toEqual([ALICE]);
    expect(users.get(ALICE)).toMatchObject({ name: 'Alice', username: 'alice' });
    expect(get).toHaveBeenCalledTimes(2);

    await directory.lookup([ALICE, BOB]);
    expect(get).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});
