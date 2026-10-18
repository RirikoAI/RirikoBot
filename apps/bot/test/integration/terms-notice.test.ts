import { UserConsentRepository } from '@ririko/database';
import { TERMS_VERSION } from '@ririko/services';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ids } from '../../../../tests/support/fake-discord/index.js';
import { OptionType, startBotHarness, type BotHarness } from '../support/bot-harness.js';

const EPHEMERAL = 64;

interface CallbackBody {
  type: number;
  data?: { content?: string; flags?: number };
}

describe('the one-time terms notice through the real router (TASK-1931)', () => {
  let harness: BotHarness;

  beforeAll(async () => {
    harness = await startBotHarness({ termsAccepted: false });
  }, 60_000);

  afterEach(async () => {
    await harness.settle();
    harness.assertAllRoutesHandled();
    harness.fake.reset();
    vi.restoreAllMocks();
    for (const userId of [ids.admin, ids.member]) {
      await harness.services.consentService.withdraw(userId, 'terms');
      await harness.services.consentService.withdraw(userId, 'ai');
    }
  });

  afterAll(() => harness?.close());

  const channelPosts = () =>
    harness.fake
      .find('POST', `/channels/${ids.generalChannel}/messages`)
      .map((r) => r.body as { content?: string; message_reference?: { message_id: string } });
  const followUps = (token: string) =>
    harness.fake
      .find('POST', `/webhooks/${ids.application}/${token}`)
      .map((r) => r.body as { content?: string; flags?: number });
  const stored = (userId: string) => harness.services.consentService.hasAccepted(userId, 'terms');
  const noticeText = () =>
    expect.stringContaining(`[Terms of Service](<${harness.services.legalLinks.termsUrl}>)`);

  it('replies to the first prefix command with the notice, after the command itself', async () => {
    const messageId = harness.sendMessage('!ping', { userId: ids.member });
    await harness.settle();

    const posts = channelPosts();
    expect(posts).toHaveLength(2);
    expect(posts[0]?.content).toContain('Pong');
    expect(posts[1]).toMatchObject({
      content: noticeText(),
      message_reference: expect.objectContaining({ message_id: messageId }),
    });
    expect(posts[1]?.content).toContain(`<${harness.services.legalLinks.privacyUrl}>`);
    expect(await stored(ids.member)).toBe(true);
  });

  it('shows the notice once: a second prefix command gets only its own reply', async () => {
    harness.sendMessage('!ping', { userId: ids.member });
    await harness.settle();
    harness.fake.reset();

    harness.sendMessage('!ping', { userId: ids.member });
    await harness.settle();

    expect(channelPosts().map((p) => p.content)).toEqual([expect.stringContaining('Pong')]);
  });

  it('answers the first slash command, then follows up with an ephemeral notice', async () => {
    const interaction = harness.runSlashCommand('ping', [], { userId: ids.member });

    const callback = (await harness.interactionCallback(interaction)).body as CallbackBody;
    expect(callback.data?.content).toContain('Pong');
    expect((callback.data?.flags ?? 0) & EPHEMERAL).toBe(0);

    await harness.fake.waitFor('POST', `/webhooks/${ids.application}/${interaction.token}`);
    const [notice] = followUps(interaction.token);
    expect(notice?.content).toEqual(noticeText());
    expect((notice?.flags ?? 0) & EPHEMERAL).toBe(EPHEMERAL);
    await harness.settle();
    expect(await stored(ids.member)).toBe(true);
  });

  it('does not repeat the notice on a later slash command', async () => {
    await harness.services.consentService.accept(ids.member, 'terms');

    const interaction = harness.runSlashCommand('ping', [], { userId: ids.member });
    await harness.interactionCallback(interaction);
    await harness.settle();

    expect(followUps(interaction.token)).toEqual([]);
  });

  it('shows no notice after a command that failed', async () => {
    // Translation is an AI feature: with the AI consent in place the empty message fails.
    await harness.services.consentService.accept(ids.member, 'ai');
    const interaction = harness.runMessageCommand(
      'Translate to English',
      { content: '' },
      { userId: ids.member },
    );

    await harness.fake.waitFor(
      'PATCH',
      `/webhooks/${ids.application}/${interaction.token}/messages/@original`,
    );
    await harness.settle();

    expect(followUps(interaction.token)).toEqual([]);
    expect(await stored(ids.member)).toBe(false);
  });

  it('shows the notice again after the terms version changes, then records the new one', async () => {
    const rows = new UserConsentRepository(harness.db);
    await rows.accept(ids.member, 'terms', '2020-01-01', new Date('2020-01-01T00:00:00Z'));

    harness.sendMessage('!ping', { userId: ids.member });
    await harness.settle();

    expect(channelPosts()).toHaveLength(2);
    expect(await rows.find(ids.member, 'terms')).toMatchObject({ version: TERMS_VERSION });
  });

  it('does not count a command that a middleware blocked', async () => {
    const interaction = harness.runSlashCommand(
      'prefix',
      [{ name: 'set', type: OptionType.String, value: '?' }],
      { userId: ids.member },
    );
    const body = (await harness.interactionCallback(interaction)).body as CallbackBody;
    await harness.settle();

    expect(body.data?.content).toMatch(/^🚫/);
    expect(followUps(interaction.token)).toEqual([]);
    expect(await stored(ids.member)).toBe(false);
  });

  it('still runs the command when the consent cannot be read or written', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(harness.services.consentService, 'hasAccepted').mockRejectedValueOnce(
      new Error('read failed'),
    );

    harness.sendMessage('!ping', { userId: ids.member });
    await harness.settle();
    expect(channelPosts().map((p) => p.content)).toEqual([expect.stringContaining('Pong')]);

    harness.fake.reset();
    vi.spyOn(harness.services.consentService, 'accept').mockRejectedValueOnce(
      new Error('write failed'),
    );
    harness.sendMessage('!ping', { userId: ids.member });
    await harness.settle();
    expect(channelPosts()).toHaveLength(2);
    expect(await stored(ids.member)).toBe(false);

    harness.fake.reset();
    harness.sendMessage('!ping', { userId: ids.member });
    await harness.settle();
    expect(channelPosts()).toHaveLength(2);
    expect(await stored(ids.member)).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[TermsNotice]'), expect.any(Error));
  });
});
