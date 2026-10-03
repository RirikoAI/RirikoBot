import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ids } from '../../../../tests/support/fake-discord/index.js';
import { startBotHarness, type BotHarness } from '../support/bot-harness.js';

describe('giveaway prefix aliases through the gateway (TASK-1254)', () => {
  let harness: BotHarness;

  beforeAll(async () => {
    harness = await startBotHarness();
  }, 60_000);

  afterEach(async () => {
    await harness.settle();
    harness.assertAllRoutesHandled();
    harness.fake.reset();
  });

  afterAll(() => harness?.close());

  interface Posted {
    content?: string;
    embeds?: Array<{ description?: string }>;
  }
  const posted = () =>
    harness.fake
      .find('POST', `/channels/${ids.generalChannel}/messages`)
      .map((request) => request.response as Posted);

  it('!gcreate, !glist, !gend and !gdelete manage a giveaway', async () => {
    harness.sendMessage('!gcreate 1h 2 Steam Key');
    await harness.settle();
    expect(posted().some((m) => m.content?.includes('Giveaway created successfully'))).toBe(true);
    const created = await harness.services.giveawayRepo.listActiveGiveaways(ids.mainGuild);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ prize: 'Steam Key', winnerCount: 2 });
    const giveawayId = created[0]!.id;

    harness.fake.reset();
    harness.sendMessage('!glist');
    await harness.settle();
    expect(posted()[0]?.embeds?.[0]?.description).toContain('Steam Key');

    harness.fake.reset();
    harness.sendMessage(`!gend ${giveawayId}`);
    await harness.settle();
    expect(posted().map((m) => m.content)).toContainEqual(
      expect.stringContaining('Giveaway for **Steam Key** ended!'),
    );
    expect((await harness.services.giveawayRepo.findById(giveawayId))?.isEnded).toBe(true);

    harness.fake.reset();
    harness.sendMessage(`!gdelete ${giveawayId}`);
    await harness.settle();
    expect(posted()[0]?.content).toContain('has been deleted');
    expect(await harness.services.giveawayRepo.findById(giveawayId)).toBeNull();
  });
});
