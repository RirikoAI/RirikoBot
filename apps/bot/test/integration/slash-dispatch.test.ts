import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ids } from '../../../../tests/support/fake-discord/index.js';
import { OptionType, startBotHarness, type BotHarness } from '../support/bot-harness.js';

const EPHEMERAL = 64;

interface CallbackBody {
  type: number;
  data?: { content?: string; flags?: number };
}

describe('slash and context menu commands through the real router (TASK-1202)', () => {
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

  it('answers the interaction callback', async () => {
    const interaction = harness.runSlashCommand('ping');
    const callback = await harness.interactionCallback(interaction);

    expect(callback.auth).toEqual({ kind: 'none' });
    expect(callback.body).toMatchObject({
      type: 4,
      data: { content: expect.stringContaining('Pong') },
    });
  });

  it('answers a permission error privately', async () => {
    const interaction = harness.runSlashCommand(
      'prefix',
      [{ name: 'set', type: OptionType.String, value: '?' }],
      { userId: ids.member },
    );
    const body = (await harness.interactionCallback(interaction)).body as CallbackBody;

    expect(body.type).toBe(4);
    expect(body.data?.content).toMatch(/^🚫/);
    expect((body.data?.flags ?? 0) & EPHEMERAL).toBe(EPHEMERAL);
    expect(await harness.services.guildSettingsService.getPrefix(ids.mainGuild)).toBe('!');
  });

  it('points a prefix-only command to its prefix form', async () => {
    const interaction = harness.runSlashCommand('glist');
    const body = (await harness.interactionCallback(interaction)).body as CallbackBody;

    expect(body.data?.content).toBe(
      'This command is only available as a prefix command (`!glist`).',
    );
  });

  it('defers a message context menu command, then edits the deferred reply', async () => {
    const interaction = harness.runMessageCommand('Translate to English', { content: '' });

    const deferred = (await harness.interactionCallback(interaction)).body as CallbackBody;
    expect(deferred.type).toBe(5);
    expect((deferred.data?.flags ?? 0) & EPHEMERAL).toBe(EPHEMERAL);

    const edit = await harness.fake.waitFor(
      'PATCH',
      `/webhooks/${ids.application}/${interaction.token}/messages/@original`,
    );
    expect(edit.body).toMatchObject({
      content:
        '❌ This message has no text to translate. Images and attachments are not supported.',
    });
  });
});
