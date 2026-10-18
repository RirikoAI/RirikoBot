import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  Collection,
  type Client,
  type Message,
  type ButtonInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import {
  createDatabaseClient,
  AdventureSessionRepository,
  PlayerEnergyRepository,
  EconomyRepository,
  XpRepository,
  WaifuCardRepository,
  WaifuAssetRepository,
  GameItemRepository,
  UserInventoryItemRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import {
  AdventureEngine,
  AdventurePayoutService,
  ItemGrantService,
  ADVENTURE_SCENARIOS,
  syncCanonicalItems,
  type ActiveAdventureSession,
} from '@ririko/services';
import type { CommandContext } from '@ririko/discord';
import type { BotServices } from '../../../services.js';
import { AdventureController } from '../adventure-controller.js';
import { createAdventureCommand } from '../adventure.command.js';
import { adventureView } from '../adventure-view.js';
import { ADVENTURE_SCENE_GROUPS, adventureScene, adventureArtwork } from '../adventure-art.js';

describe('adventure Discord integration', () => {
  let db: SqliteDatabaseClient,
    services: BotServices,
    controller: AdventureController,
    client: Client;
  let now: number, session: ActiveAdventureSession;
  let messages: Collection<string, Message>;
  let send: ReturnType<
      typeof vi.fn<(payload: ReturnType<typeof adventureView>) => Promise<Message>>
    >,
    fetchChannel: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    db = (await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    })) as SqliteDatabaseClient;
    const energy = new PlayerEnergyRepository(db),
      economy = new EconomyRepository(db);
    const sessions = new AdventureSessionRepository<ActiveAdventureSession>(db);
    const cards = new WaifuCardRepository(db);
    const itemCatalog = new GameItemRepository(db);
    await syncCanonicalItems(itemCatalog);
    const payments = new AdventurePayoutService({
      energy,
      economy,
      xp: new XpRepository(db),
      cards,
      assets: new WaifuAssetRepository(db),
      items: new ItemGrantService(itemCatalog, new UserInventoryItemRepository(db)),
    });
    now = 1_000_000;
    const engine = new AdventureEngine({
      completionRewards: false /* Retain coverage of stored version-1 reward behavior. */,
      energy,
      sessions,
      payments,
      seed: () => 1702,
      now: () => now,
    });
    services = {
      adventureEngine: engine,
      adventureSessions: sessions,
      playerEnergyRepo: energy,
      economyRepo: economy,
      waifuCardRepo: cards,
      loadoutService: { buildCombatant: vi.fn() },
    } as unknown as BotServices;
    controller = new AdventureController(services);
    messages = new Collection();
    send = vi.fn(async (payload: ReturnType<typeof adventureView>) => {
      const stored = {
        id: `m${messages.size + 1}`,
        author: { id: 'bot' },
        components: [] as unknown[],
        edit: vi.fn(async (next: ReturnType<typeof adventureView>) => {
          apply(next);
          return stored;
        }),
      };
      function apply(next: ReturnType<typeof adventureView>) {
        stored.components = next.components.map((row) => ({
          components: row.components.map((button) => ({
            customId: 'custom_id' in button.data ? button.data.custom_id : undefined,
          })),
        }));
      }
      apply(payload);
      const message = stored as unknown as Message;
      messages.set(message.id, message);
      return message;
    });
    const channel = {
      isSendable: () => true,
      send,
      messages: {
        fetch: vi.fn(async (arg: string | { limit: number }) => {
          if (typeof arg !== 'string') return messages;
          const found = messages.get(arg);
          if (!found) throw Object.assign(new Error('deleted'), { code: 10008 });
          return found;
        }),
      },
    };
    fetchChannel = vi.fn(async () => channel);
    client = { user: { id: 'bot' }, channels: { fetch: fetchChannel } } as unknown as Client;
    session = await engine.start({
      userId: 'alice',
      guildId: 'guild',
      channelId: 'channel',
      scenarioId: 'the-goblin-bazaar',
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    controller.stop();
    vi.restoreAllMocks();
    await db.close();
  });
  function button(choice: string, userId = 'alice', revision = session.revision) {
    return {
      customId: `adventure:${session.id}:${revision}:${choice}`,
      user: { id: userId },
      guildId: 'guild',
      channelId: 'channel',
      client,
      reply: vi.fn(),
      deferUpdate: vi.fn(),
      followUp: vi.fn(),
    } as unknown as ButtonInteraction;
  }
  function context(action: string, source: 'prefix' | 'slash' = 'prefix', scenario?: string) {
    const ctx = {
      guildId: 'guild',
      channelId: 'channel',
      user: { id: 'alice' },
      client,
      source,
      raw: { deleteReply: vi.fn(async () => {}) },
      isDeferred: false,
      member: { permissions: { has: () => false } },
      options: {
        getRawArgs: () => (source === 'prefix' ? [action, ...(scenario ? [scenario] : [])] : []),
        getString: (name: string) =>
          source === 'slash'
            ? name === 'action'
              ? action
              : name === 'scenario'
                ? (scenario ?? null)
                : null
            : null,
        getBoolean: () => null,
      },
      reply: vi.fn(),
      editReply: vi.fn(),
      deferReply: vi.fn(async () => {
        ctx.isDeferred = true;
      }),
    };
    return ctx as unknown as CommandContext;
  }
  it('renders every decision into valid public embeds and bounded owner-routed buttons', () => {
    for (const scenario of ADVENTURE_SCENARIOS)
      for (const node of Object.values(scenario.nodes)) {
        if (node.type !== 'decision') continue;
        const view = adventureView({ ...session, scenarioId: scenario.id, currentNodeId: node.id });
        expect(view.embeds[0]!.toJSON().description).toContain(node.narrative);
        expect(view.embeds[0]!.toJSON().fields?.map((field) => field.name)).toEqual(['Companion']);
        expect(view.embeds[0]!.length).toBeLessThan(6000);
        expect(view.components[0]!.components).toHaveLength(node.choices.length);
        for (const row of view.components)
          for (const button of row.components) {
            const data = button.toJSON();
            expect('custom_id' in data ? data.custom_id.length : 101).toBeLessThanOrEqual(100);
          }
        expect(view.allowedMentions.parse).toEqual([]);
      }
  });
  it('maps every branch to exactly one bundled scene and replaces previous attachments', () => {
    for (const scenario of ADVENTURE_SCENARIOS) {
      const mapped = Object.values(ADVENTURE_SCENE_GROUPS[scenario.id]!).flat();
      expect(mapped.sort()).toEqual(Object.keys(scenario.nodes).sort());
      for (const node of Object.values(scenario.nodes)) {
        expect(adventureScene(scenario.id, node.id)).toBeTruthy();
        expect(adventureArtwork(scenario.id, node.id)).toBeDefined();
      }
    }
    const view = adventureView(session);
    expect(view.files).toHaveLength(1);
    expect(view.attachments).toEqual([]);
    expect(view.embeds[0]!.toJSON().image?.url).toBe('attachment://adventure-scene.png');
    expect(adventureArtwork('missing-scenario', 'missing-node')).toBeUndefined();
  });
  it.each([
    [15, 0, 'Energy: **-15**'],
    [15, -5, 'Energy: **-20**'],
    [15, 7, 'Energy: **-8**'],
    [15, 15, undefined],
    [0, 0, undefined],
  ] as const)(
    'combines entry %i and settlement %i into one energy value',
    async (entry, change, expected) => {
      const ended = await services.adventureEngine.cancel('alice', session.id);
      const view = adventureView({
        ...ended,
        entryEnergyCharged: entry,
        receipt: { ...ended.receipt!, energyChange: change },
      });
      const fields = view.embeds[0]!.toJSON().fields ?? [];
      expect(fields.find((field) => field.name === 'Progress')?.value).toBe(expected);
      expect(fields.some((field) => field.name === 'Credits')).toBe(false);
      expect(fields.some((field) => field.name === 'Your journey')).toBe(false);
      expect(JSON.stringify(fields)).not.toContain('entry:');
    },
  );
  it('keeps nonzero rewards and readable loot while hiding routes and zero statistics', async () => {
    const ended = await services.adventureEngine.cancel('alice', session.id);
    const view = adventureView({
      ...ended,
      status: 'COMPLETED',
      currentNodeId: 'appraised',
      history: [
        {
          revision: 0,
          nodeId: 'root',
          choiceId: '1',
          label: 'SECRET PATH',
          nextNodeId: 'market',
          paidCredits: '0',
          paidItems: [],
          acceptedAt: now,
        },
      ],
      receipt: {
        ...ended.receipt!,
        status: 'COMPLETED',
        grossCredits: '150',
        netCredits: '150',
        xp: 100,
        energyChange: 0,
        items: [
          { code: 'POTION_MINOR_HP', quantity: 1 },
          { code: 'POTION_MAJOR_HP', quantity: 0 },
        ],
      },
    });
    const embed = view.embeds[0]!.toJSON();
    expect(embed.fields?.find((field) => field.name === 'Credits')?.value).toBe('Rewards: **150**');
    expect(embed.fields?.find((field) => field.name === 'Progress')?.value).toBe(
      'XP: **+100**\nEnergy: **-15**',
    );
    expect(embed.fields?.find((field) => field.name === 'Loot')?.value).not.toContain('POTION_');
    expect(JSON.stringify(embed)).not.toMatch(/SECRET PATH|Your journey|Dust:|Losses:|Spent:/);
    expect(view.components).toEqual([]);
  });
  it('shows actual companion XP and level gains without zero XP or route history', async () => {
    const ended = await services.adventureEngine.cancel('alice', session.id);
    const receipt = {
      ...ended.receipt!,
      companionXp: {
        userCardId: 'owned',
        cardName: 'Rem',
        expGained: 740,
        previousLevel: 18,
        newLevel: 19,
        levelsGained: 1,
        isMaxLevel: false,
        expToNextLevel: 100,
      },
    };
    const fields = adventureView({ ...ended, receipt }).embeds[0]!.toJSON().fields!;
    expect(fields.find((f) => f.name === 'Progress')?.value).toContain('Companion XP: **+740**');
    expect(fields.find((f) => f.name === 'Progress')?.value).toContain('18 → 19');
    const capped = adventureView({
      ...ended,
      receipt: {
        ...receipt,
        companionXp: { ...receipt.companionXp, expGained: 0, levelsGained: 0 },
      },
    });
    expect(JSON.stringify(capped.embeds[0]!.toJSON().fields)).not.toContain('Companion XP');
  });
  it('rejects another player and malformed input without changing state', async () => {
    const outsider = button('1', 'bob');
    await controller.button(outsider);
    expect(outsider.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    const invalid = { ...button('1'), customId: 'adventure:bad' } as unknown as ButtonInteraction;
    await controller.button(invalid);
    expect(invalid.reply).toHaveBeenCalled();
    expect((await services.adventureSessions.findById(session.id))?.revision).toBe(0);
  });
  it('uses bounded autocomplete so scenarios beyond the first 25 remain selectable', async () => {
    const command = createAdventureCommand(services, controller);
    const option = command.metadata.options?.find((option) => option.name === 'scenario');
    expect(option?.autocomplete).toBe(true);
    expect(option?.choices).toBeUndefined();
    for (const query of ['', 'DAWN ARCHIVE', 'xyz-no-story']) {
      const respond = vi.fn();
      await command.autocomplete!({
        options: { getFocused: () => ({ name: 'scenario', value: query }) },
        respond,
      } as unknown as AutocompleteInteraction);
      const choices = respond.mock.calls[0]![0] as Array<{ name: string; value: string }>;
      expect(choices.length).toBeLessThanOrEqual(25);
      if (query === 'DAWN ARCHIVE')
        expect(choices).toEqual([{ name: 'The Dawn Archive', value: 'the-dawn-archive' }]);
      if (query === 'xyz-no-story') expect(choices).toEqual([]);
    }
  });
  it.each(ADVENTURE_SCENARIOS.slice(5))(
    'plays $id through four free decisions on one illustrated message',
    async (scenario) => {
      session = await services.adventureEngine.start({
        userId: scenario.id,
        guildId: 'guild',
        channelId: 'channel',
        scenarioId: scenario.id,
      });
      session = await controller.deliver(client, session);
      const messageId = session.messageId;
      for (let step = 0; step < 4; step++) {
        const node = scenario.nodes[session.currentNodeId]!;
        expect(node.type).toBe('decision');
        if (node.type !== 'decision') throw new Error('Adventure ended early');
        const choice = node.choices.find(
          (choice) => !choice.cost && choice.transition.type === 'direct',
        )!;
        const click = button(choice.id, session.userId, session.revision);
        await controller.button(click);
        expect(click.followUp).not.toHaveBeenCalled();
        session = (await services.adventureSessions.findById(session.id))!;
        expect(session.messageId).toBe(messageId);
        const view = adventureView(session);
        expect(view.files).toHaveLength(1);
        expect(view.embeds[0]!.toJSON().image?.url).toBe('attachment://adventure-scene.png');
      }
      expect(session.status).toBe('COMPLETED');
      expect(session.history).toHaveLength(4);
      expect(session.receipt?.paidCredits).toBe('0');
      expect(send).toHaveBeenCalledOnce();
      expect(messages.get(messageId!)?.edit).toHaveBeenCalledTimes(4);
      expect(await services.adventureSessions.findActive(session.userId)).toBeNull();
    },
  );
  it('edits the canonical message and accepts persisted buttons after controller restart', async () => {
    session = await controller.deliver(client, session);
    const restarted = new AdventureController(services);
    await restarted.button(button('3'));
    const current = (await services.adventureSessions.findById(session.id))!;
    expect(current.revision).toBe(1);
    expect(current.presented).toBe(true);
    expect(current.messageId).toBe(session.messageId);
    expect(send).toHaveBeenCalledTimes(1);
    const stale = button('1');
    await restarted.button(stale);
    expect(stale.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('already ended') }),
    );
    expect((await services.adventureSessions.findById(session.id))?.revision).toBe(1);
  });
  it('rejects stale abandon buttons atomically', async () => {
    session = await controller.deliver(client, session);
    await controller.button(button('3'));
    const stale = button('abandon');
    await controller.button(stale);
    expect(stale.followUp).toHaveBeenCalled();
    expect((await services.adventureSessions.findById(session.id))?.status).toBe('ACTIVE');
  });
  it('recovers a successful send whose response was lost without sending another message', async () => {
    const realSend = send.getMockImplementation()!;
    send.mockImplementationOnce(async (...args) => {
      await realSend(...args);
      throw new Error('response lost');
    });
    await expect(controller.deliver(client, session)).rejects.toThrow('response lost');
    expect((await services.adventureSessions.findById(session.id))?.presented).toBe(false);
    await controller.recover(client);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await services.adventureSessions.findById(session.id))?.messageId).toBe('m1');
  });
  it('refunds full entry after a definite initial permission failure', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('no permission'), { code: 50013 }));
    await expect(controller.deliver(client, session)).rejects.toThrow('no permission');
    expect((await services.adventureSessions.findById(session.id))?.status).toBe('START_FAILED');
    expect((await services.playerEnergyRepo.findById('alice'))?.currentEnergy).toBe(100);
  });
  it('preserves a published adventure during delivery failure and refunds half at timeout', async () => {
    session = await controller.deliver(client, session);
    fetchChannel.mockResolvedValue(null);
    await expect(controller.deliver(client, session)).rejects.toThrow('unavailable');
    expect((await services.adventureSessions.findById(session.id))?.status).toBe('ACTIVE');
    expect((await services.playerEnergyRepo.findById('alice'))?.currentEnergy).toBe(85);
    now += 90_001;
    await controller.recover(client);
    expect((await services.adventureSessions.findById(session.id))?.status).toBe('TIMED_OUT');
    expect((await services.playerEnergyRepo.findById('alice'))?.currentEnergy).toBe(92);
  });
  it('disables expired buttons and refunds exactly once during recovery', async () => {
    session = await controller.deliver(client, session);
    now += 90_001;
    await controller.recover(client);
    await controller.recover(client);
    expect((await services.adventureSessions.findById(session.id))?.status).toBe('TIMED_OUT');
    expect((await services.playerEnergyRepo.findById('alice'))?.currentEnergy).toBe(92);
    expect(messages.get('m1')!.components).toEqual([]);
  });
  it.each(['prefix', 'slash'] as const)(
    'provides status and abandon through %s without a start cooldown',
    async (source) => {
      session = await controller.deliver(client, session);
      const command = createAdventureCommand(services, controller);
      const status = context('status', source);
      await command.execute(status);
      expect(source === 'slash' ? status.editReply : status.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('/guild/channel/m1') }),
      );
      const abandon = context('abandon', source);
      await command.execute(abandon);
      expect((await services.adventureSessions.findById(session.id))?.status).toBe('ABANDONED');
      const receipt = context('status', source);
      await command.execute(receipt);
      expect(source === 'slash' ? receipt.editReply : receipt.reply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array), components: [] }),
      );
    },
  );
  it('guards settings with Manage Server permission', async () => {
    const ctx = context('settings');
    await createAdventureCommand(services, controller).execute(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Manage Server') }),
    );
    expect(await services.adventureSessions.getSettings('guild')).toEqual({ energyEnabled: true });
  });
  it.each(['prefix', 'slash'] as const)(
    'shows ranks through %s without charging or changing an active run',
    async (source) => {
      const before = await services.adventureSessions.findById(session.id);
      const ctx = context('ranks', source);
      await createAdventureCommand(services, controller).execute(ctx);
      expect(source === 'slash' ? ctx.editReply : ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('+500%') }),
      );
      expect(source === 'slash' ? ctx.editReply : ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('10% chance into 60%') }),
      );
      expect(await services.adventureSessions.findById(session.id)).toEqual(before);
      expect((await services.playerEnergyRepo.findById('alice'))?.currentEnergy).toBe(85);
      expect(send).not.toHaveBeenCalled();
    },
  );
  it('uses the owned level at admission, renders a compact rank, and keeps it after level changes', async () => {
    await services.adventureEngine.cancel('alice', session.id, 'START_FAILED');
    now += 10_001;
    const owned = { id: 'owned-card', level: 40, userId: 'alice', state: 'EQUIPPED' };
    const read = vi
      .spyOn(services.waifuCardRepo, 'listUserCards')
      .mockResolvedValue([owned as never]);
    vi.mocked(services.loadoutService.buildCombatant).mockResolvedValue({
      name: 'Rem',
      element: 'WATER',
      attack: 150,
      defense: 150,
      speed: 150,
    } as never);
    await createAdventureCommand(services, controller).execute(
      context('start', 'prefix', 'the-clockwork-orchard'),
    );
    session = (await services.adventureSessions.findActive('alice'))!;
    expect(read).toHaveBeenCalledWith(
      'alice',
      { state: 'EQUIPPED', limit: 1 },
      expect.objectContaining({ dialect: 'sqlite' }),
    );
    expect(session.card).toMatchObject({ level: 40, userCardId: 'owned-card' });
    expect(session.rewardRank).toMatchObject({ rank: 'B', amountBps: 30000 });
    const companion = adventureView(session).embeds[0]!.toJSON().fields![0]!;
    expect(companion.value).toContain('Rem (Lv.40)');
    expect(companion.value).toContain('Reward rank B · +200% rewards · +200% drop chance');
    owned.level = 100;
    for (const choice of ['2', '1', '1', '1']) {
      await controller.button(button(choice));
      session = (await services.adventureSessions.findById(session.id))!;
    }
    expect(session.receipt?.grossCredits).toBe('660');
    const final = adventureView(session).embeds[0]!.toJSON();
    expect(final.footer?.text).toBe('Reward rank B');
    expect(final.fields?.some((f) => f.name.toLowerCase().includes('journey'))).toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });
  it.each(['prefix', 'slash'] as const)(
    'starts the selected scenario through %s',
    async (source) => {
      await services.adventureEngine.cancel('alice', session.id, 'START_FAILED');
      now += 10_001;
      const ctx = context('start', source, 'the-bandit-ambush');
      await createAdventureCommand(services, controller).execute(ctx);
      const started = await services.adventureSessions.findActive('alice');
      expect(started).toMatchObject({
        scenarioId: 'the-bandit-ambush',
        presented: true,
        card: null,
      });
      expect(send).toHaveBeenCalledTimes(1);
      expect(ctx.reply).not.toHaveBeenCalled();
      expect(ctx.editReply).not.toHaveBeenCalled();
      if (source === 'slash')
        expect((ctx.raw as unknown as { deleteReply: unknown }).deleteReply).toHaveBeenCalledOnce();
      expect((await services.playerEnergyRepo.findById('alice'))?.currentEnergy).toBe(85);
    },
  );
  it('removes buttons when an initial send returns after the recovery deadline', async () => {
    const original = send.getMockImplementation()!;
    send.mockImplementationOnce(async (payload) => {
      now += 90_001;
      return original(payload);
    });
    const ended = await controller.deliver(client, session);
    expect(ended.status).toBe('START_FAILED');
    expect(messages.get('m1')?.components).toEqual([]);
    expect((await services.playerEnergyRepo.findById('alice'))?.currentEnergy).toBe(100);
  });
  it('enforces the persisted 10-second throttle across engine restarts without blocking status', async () => {
    await services.adventureEngine.cancel('alice', session.id);
    await expect(
      services.adventureEngine.start({
        userId: 'alice',
        guildId: 'elsewhere',
        channelId: 'elsewhere',
      }),
    ).rejects.toMatchObject({ code: 'START_COOLDOWN' });
    expect((await services.adventureEngine.status('alice'))?.status).toBe('ABANDONED');
    expect(createAdventureCommand(services).metadata.aliases).toEqual([
      'adv',
      'journey',
      'quest-adventure',
    ]);
  });
});
