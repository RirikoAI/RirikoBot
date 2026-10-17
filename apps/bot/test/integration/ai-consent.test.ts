import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ids, type StoredMessage } from '../../../../tests/support/fake-discord/index.js';
import { OptionType, startBotHarness, type BotHarness } from '../support/bot-harness.js';

const EPHEMERAL = 64;
const CHANNEL_MESSAGE = 4;
const UPDATE_MESSAGE = 7;

interface Component {
  custom_id?: string;
  label?: string;
  components?: Component[];
}

interface CallbackBody {
  type: number;
  data?: {
    content?: string;
    flags?: number;
    embeds?: Array<{ description?: string }>;
    components?: Component[];
  };
}

const buttonsOf = (message: StoredMessage | undefined): Component[] =>
  ((message?.components ?? []) as Component[]).flatMap((row) => row.components ?? []);

describe('the AI consent gate through the real router and components (TASK-1933)', () => {
  let harness: BotHarness;
  let providerCalls: number[] = [];

  beforeAll(async () => {
    harness = await startBotHarness();
  }, 60_000);

  afterEach(async () => {
    await harness.settle();
    harness.assertAllRoutesHandled();
    harness.fake.reset();
    vi.restoreAllMocks();
    for (const userId of [ids.admin, ids.member]) {
      await harness.services.consentService.withdraw(userId, 'ai');
    }
  });

  afterAll(() => harness?.close());

  /** Every route to an AI or image provider is replaced by a stub that counts the call. */
  function watchProviders() {
    providerCalls = [];
    const refuse = async (): Promise<never> => {
      providerCalls.push(1);
      throw new Error('stubbed provider');
    };
    const { fallbackChainManager, imageGenerationService } = harness.services;
    vi.spyOn(fallbackChainManager, 'generate').mockImplementation(refuse);
    vi.spyOn(fallbackChainManager, 'stream').mockImplementation(() => {
      providerCalls.push(1);
      throw new Error('stubbed provider');
    });
    vi.spyOn(imageGenerationService, 'generateImage').mockImplementation(refuse);
  }

  const channelPosts = () =>
    harness.fake.find('POST', `/channels/${ids.generalChannel}/messages`).map((r) => ({
      body: r.body as { content?: string; embeds?: Array<{ description?: string }> },
      message: r.response as StoredMessage,
    }));
  const hasAgreed = (userId: string) => harness.services.consentService.hasAccepted(userId, 'ai');

  /** A member asks for an image with a prefix command; returns the prompt message the bot posted. */
  async function askForImage(userId = ids.member): Promise<StoredMessage> {
    harness.sendMessage('!imagine a cat in a hat', { userId });
    await harness.settle();
    const [post] = channelPosts();
    expect(post).toBeDefined();
    return post!.message;
  }

  it('answers a prefix imagine with the prompt and sends nothing to a provider', async () => {
    watchProviders();

    const prompt = await askForImage();

    const [post] = channelPosts();
    expect(channelPosts()).toHaveLength(1);
    expect(post!.body.embeds?.[0]?.description).toContain('90 days');
    expect(post!.body.embeds?.[0]?.description).toContain('`ai consent withdraw`');
    expect(buttonsOf(prompt).map((b) => [b.label, b.custom_id])).toEqual([
      ['I agree', `consent:ai:accept:${ids.member}`],
      ['No thanks', `consent:ai:decline:${ids.member}`],
    ]);
    expect(providerCalls).toHaveLength(0);
  });

  it('shows a slash chat the prompt privately and calls no provider', async () => {
    watchProviders();

    const interaction = harness.runSlashCommand(
      'ai',
      [{ name: 'prompt', type: OptionType.String, value: 'my private question' }],
      { userId: ids.member },
    );
    const callback = (await harness.interactionCallback(interaction)).body as CallbackBody;

    expect(callback.type).toBe(CHANNEL_MESSAGE);
    expect((callback.data?.flags ?? 0) & EPHEMERAL).toBe(EPHEMERAL);
    expect(callback.data?.embeds?.[0]?.description).toContain('Terms of Service');
    expect(callback.data?.components?.[0]?.components?.map((b) => b.label)).toEqual([
      'I agree',
      'No thanks',
    ]);
    expect(providerCalls).toHaveLength(0);
  });

  it('shows the translate context menu the prompt in place of the translation', async () => {
    watchProviders();

    const interaction = harness.runMessageCommand(
      'Translate to English',
      { content: 'Bonjour' },
      { userId: ids.member },
    );
    const edit = await harness.fake.waitFor(
      'PATCH',
      `/webhooks/${ids.application}/${interaction.token}/messages/@original`,
    );

    const body = edit.body as CallbackBody['data'];
    expect(body?.embeds?.[0]?.description).toContain('Privacy Policy');
    expect(body?.components?.[0]?.components).toHaveLength(2);
    expect(providerCalls).toHaveLength(0);
  });

  it('shows the prompt for the regenerate button of an older image', async () => {
    watchProviders();
    const job = await harness.services.imageRepo.create({
      userId: ids.member,
      guildId: ids.mainGuild,
      providerId: 'mock',
      prompt: 'a cat in a hat',
      status: 'COMPLETED',
    });
    const imageMessage = {
      id: '900000000000000001',
      channel_id: ids.generalChannel,
      components: [],
    } as unknown as StoredMessage;

    const press = harness.useComponent(imageMessage, `imagine:regen:${job.id}`, {
      userId: ids.member,
    });
    const callback = (await harness.interactionCallback(press)).body as CallbackBody;

    expect(callback.type).toBe(CHANNEL_MESSAGE);
    expect((callback.data?.flags ?? 0) & EPHEMERAL).toBe(EPHEMERAL);
    expect(callback.data?.components?.[0]?.components).toHaveLength(2);
    expect(providerCalls).toHaveLength(0);
  });

  it('ignores a press of another user and records nothing', async () => {
    const prompt = await askForImage();

    const press = harness.useComponent(prompt, `consent:ai:accept:${ids.member}`, {
      userId: ids.admin,
    });
    const callback = (await harness.interactionCallback(press)).body as CallbackBody;

    expect(callback.type).toBe(CHANNEL_MESSAGE);
    expect(callback.data?.content).toContain('for someone else');
    expect((callback.data?.flags ?? 0) & EPHEMERAL).toBe(EPHEMERAL);
    expect(await hasAgreed(ids.member)).toBe(false);
    expect(await hasAgreed(ids.admin)).toBe(false);
  });

  it('keeps AI off after "No thanks" and records nothing', async () => {
    watchProviders();
    const prompt = await askForImage();

    const press = harness.useComponent(prompt, `consent:ai:decline:${ids.member}`, {
      userId: ids.member,
    });
    const callback = (await harness.interactionCallback(press)).body as CallbackBody;

    expect(callback.type).toBe(UPDATE_MESSAGE);
    expect(callback.data?.content).toContain('AI features stay off for you');
    expect(callback.data?.components).toEqual([]);
    expect(await hasAgreed(ids.member)).toBe(false);
    expect(providerCalls).toHaveLength(0);
  });

  it('records the consent after "I agree", and the next request reaches the provider', async () => {
    watchProviders();
    const prompt = await askForImage();
    expect(providerCalls).toHaveLength(0);

    const press = harness.useComponent(prompt, `consent:ai:accept:${ids.member}`, {
      userId: ids.member,
    });
    const callback = (await harness.interactionCallback(press)).body as CallbackBody;

    expect(callback.type).toBe(UPDATE_MESSAGE);
    expect(callback.data?.content).toContain('Send your request again');
    expect(callback.data?.components).toEqual([]);
    expect(await hasAgreed(ids.member)).toBe(true);
    expect(await harness.services.consentService.hasAccepted(ids.member, 'terms')).toBe(true);

    harness.fake.reset();
    // (A chat request: `imagine` has a cooldown that the first request started.)
    harness.sendMessage('!ai chat hello there', { userId: ids.member });
    await harness.settle();

    expect(providerCalls).toHaveLength(1);
  });

  it('withdraws through the slash command: consent, conversations and preferences are gone', async () => {
    watchProviders();
    await harness.services.consentService.accept(ids.member, 'ai');
    const context = { userId: ids.member, guildId: ids.mainGuild, channelId: ids.generalChannel };
    await harness.services.conversationManager.recordTurn(context, 'Hello', 'Hi');
    await harness.services.conversationManager.setUserPreferences(ids.member, { nickname: 'M' });

    const interaction = harness.runSlashCommand(
      'ai',
      [
        { name: 'action', type: OptionType.String, value: 'consent' },
        { name: 'consent', type: OptionType.String, value: 'withdraw' },
      ],
      { userId: ids.member },
    );
    const callback = (await harness.interactionCallback(interaction)).body as CallbackBody;

    expect(callback.data?.content).toContain('Your AI consent is withdrawn');
    expect((callback.data?.flags ?? 0) & EPHEMERAL).toBe(EPHEMERAL);
    expect(await hasAgreed(ids.member)).toBe(false);
    expect(await harness.services.conversationManager.getContextMessages(context, 10)).toEqual([]);
    expect(await harness.services.conversationManager.getUserPreferences(ids.member)).toBeNull();

    // And the gate is back.
    harness.fake.reset();
    const chat = harness.runSlashCommand(
      'ai',
      [{ name: 'prompt', type: OptionType.String, value: 'hello again' }],
      { userId: ids.member },
    );
    const again = (await harness.interactionCallback(chat)).body as CallbackBody;
    expect(again.data?.components?.[0]?.components).toHaveLength(2);
    expect(providerCalls).toHaveLength(0);
  });

  it('shows the status through the prefix form', async () => {
    harness.sendMessage('!ai consent status', { userId: ids.member });
    await harness.settle();
    expect(channelPosts()[0]?.body.content).toContain('You have not agreed to AI features');

    harness.fake.reset();
    await harness.services.consentService.accept(ids.member, 'ai');
    harness.sendMessage('!ai consent status', { userId: ids.member });
    await harness.settle();
    expect(channelPosts()[0]?.body.content).toMatch(/agreed to AI features on <t:\d+:D>/);
  });
});
