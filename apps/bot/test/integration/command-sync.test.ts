import { CommandSynchronizer, createRestClient } from '@ririko/discord';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { gatewayGuildCreate, ids } from '../../../../tests/support/fake-discord/index.js';
import { registerGuildJoinCommandSync, syncCommandsOnStartup } from '../../src/command-sync.js';
import { startBotHarness, type BotHarness } from '../support/bot-harness.js';

interface CommandPayload {
  name: string;
}

describe('command registration against the Discord API (TASK-1202)', () => {
  let harness: BotHarness;
  let sync: CommandSynchronizer;
  const log = { log: () => undefined, error: (...args: unknown[]) => console.error(...args) };

  beforeAll(async () => {
    harness = await startBotHarness();
    const rest = createRestClient('fake-bot-token', { api: harness.fake.apiUrl });
    sync = new CommandSynchronizer(rest, harness.router.registry);
    registerGuildJoinCommandSync(harness.client, sync, ids.application, log);
  }, 60_000);

  afterEach(async () => {
    await harness.settle();
    harness.assertAllRoutesHandled();
    harness.fake.reset();
  });

  afterAll(() => harness?.close());

  const names = (body: unknown) => (body as CommandPayload[]).map((c) => c.name).sort();

  it('registers global commands once and per-server commands in every server', async () => {
    await syncCommandsOnStartup({
      sync,
      rest: createRestClient('fake-bot-token', { api: harness.fake.apiUrl }),
      applicationId: ids.application,
      log,
    });

    const global = harness.fake.find('PUT', `/applications/${ids.application}/commands`);
    expect(global).toHaveLength(1);
    expect(names(global[0]?.body)).toEqual(
      sync
        .generatePayloads({ scope: 'global' })
        .map((p) => p.name)
        .sort(),
    );
    const guildScoped = sync
      .generatePayloads({ scope: 'guild' })
      .map((p) => p.name)
      .sort();
    for (const guildId of [ids.mainGuild, ids.otherGuild]) {
      const put = harness.fake.find(
        'PUT',
        `/applications/${ids.application}/guilds/${guildId}/commands`,
      );
      expect(names(put[0]?.body)).toEqual(guildScoped);
    }
    expect(names(global[0]?.body)).not.toContain('prefix');
  });

  it('registers per-server commands when the bot joins a server', async () => {
    const joined = {
      id: '200000000000000099',
      name: 'New Server',
      ownerId: ids.admin,
      roles: [{ id: '200000000000000099', name: '@everyone', permissions: 0n, position: 0 }],
      channels: [],
      members: [{ userId: ids.bot, roleIds: [] }],
    };
    harness.dispatch('GUILD_CREATE', gatewayGuildCreate(harness.fake.fixture, joined));

    const put = await harness.fake.waitFor(
      'PUT',
      `/applications/${ids.application}/guilds/${joined.id}/commands`,
    );
    expect(names(put.body)).toContain('prefix');
  });
});
