import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ids, type StoredMessage } from '../../../../tests/support/fake-discord/index.js';
import { OptionType, startBotHarness, type BotHarness } from '../support/bot-harness.js';

interface Component {
  type: number;
  custom_id?: string;
  options?: Array<{ value: string }>;
  components?: Component[];
}

/** Every interactive component in a message's action rows. */
function componentsOf(message: StoredMessage | undefined): Component[] {
  const rows = (message?.components ?? []) as Component[];
  return rows.flatMap((row) => row.components ?? []);
}

describe('component interactions on messages the bot sent (TASK-1202)', () => {
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

  it('opens a help category from the help center select menu', async () => {
    harness.sendMessage('!help');
    const sent = await harness.fake.waitFor('POST', `/channels/${ids.generalChannel}/messages`);
    const helpMessage = sent.response as StoredMessage;
    const select = componentsOf(helpMessage).find((c) => c.custom_id === 'help:category:select');
    const category = select?.options?.[0]?.value;
    expect(category).toBeDefined();

    const interaction = harness.useComponent(helpMessage, 'help:category:select', {
      values: [category ?? ''],
    });
    const callback = await harness.interactionCallback(interaction);

    // 7: update the message the menu is on.
    expect(callback.body).toMatchObject({ type: 7, data: { embeds: [expect.any(Object)] } });
  });

  it('runs a giveaway from creation through entry to the draw', async () => {
    const create = harness.runSlashCommand('giveaway', [
      { name: 'action', type: OptionType.String, value: 'create' },
      { name: 'prize', type: OptionType.String, value: 'Nitro' },
      { name: 'duration', type: OptionType.String, value: '1h' },
    ]);
    expect((await harness.interactionCallback(create)).body).toMatchObject({
      type: 4,
      data: { content: expect.stringContaining('Giveaway created successfully') },
    });
    const posted = harness.fake.find('POST', `/channels/${ids.generalChannel}/messages`)[0];
    const giveawayMessage = posted?.response as StoredMessage;
    const enterButton = componentsOf(giveawayMessage).find((c) =>
      c.custom_id?.startsWith('giveaway:enter:'),
    );
    const giveawayId = enterButton?.custom_id?.replace('giveaway:enter:', '') ?? '';
    expect(await harness.services.giveawayRepo.findById(giveawayId)).toMatchObject({
      prize: 'Nitro',
      messageId: giveawayMessage.id,
    });

    const enter = harness.useComponent(giveawayMessage, enterButton?.custom_id ?? '', {
      userId: ids.member,
    });
    await harness.interactionCallback(enter);
    expect(await harness.services.giveawayRepo.hasUserEntered(giveawayId, ids.member)).toBe(true);
    // The entry count on the giveaway message is refreshed.
    await harness.fake.waitFor(
      'PATCH',
      `/channels/${ids.generalChannel}/messages/${giveawayMessage.id}`,
    );

    const end = harness.runSlashCommand('giveaway', [
      { name: 'action', type: OptionType.String, value: 'end' },
      { name: 'giveaway', type: OptionType.String, value: giveawayId },
    ]);
    expect((await harness.interactionCallback(end)).body).toMatchObject({
      data: { content: expect.stringContaining(`<@${ids.member}>`) },
    });
  });
});
