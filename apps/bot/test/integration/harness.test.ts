import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ids } from '../../../../tests/support/fake-discord/index.js';
import { startBotHarness, type BotHarness } from '../support/bot-harness.js';

describe('bot harness', () => {
  let harness: BotHarness;

  beforeAll(async () => {
    harness = await startBotHarness();
  }, 60_000);
  afterAll(() => harness?.close());

  it('connects the client from READY and GUILD_CREATE packets', () => {
    const { client } = harness;
    expect(client.isReady()).toBe(true);
    expect(client.user?.id).toBe(ids.bot);
    expect(client.application?.id).toBe(ids.application);
    const guild = client.guilds.cache.get(ids.mainGuild);
    expect(guild?.available).toBe(true);
    expect(guild?.members.cache.get(ids.member)?.user.username).toBe('member');
    expect(guild?.channels.cache.get(ids.generalChannel)?.name).toBe('general');
  });

  it('answers a prefix command with a real REST request', async () => {
    harness.sendMessage('!ping');
    const reply = await harness.fake.waitFor('POST', `/channels/${ids.generalChannel}/messages`);
    expect(reply.body).toMatchObject({ content: expect.stringContaining('Pong') });
    harness.assertAllRoutesHandled();
  });
});
