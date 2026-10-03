import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { DungeonBattleManager } from '../dungeon-battle.manager.js';
import type { BotServices } from '../../../services.js';

/* A scripted stand-in for DungeonBattleSession: each action moves to the next prepared state,
 * so every turn outcome is deterministic and no RNG is involved. */

function combatant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: 'Hero',
    element: 'FIRE',
    currentHealth: 800,
    maxHealth: 1000,
    currentMp: 40,
    maxMp: 100,
    skillName: 'Blaze',
    skillManaCost: 30,
    statusEffects: [],
    ...overrides,
  };
}

function turnState(overrides: Record<string, unknown> = {}) {
  return {
    turn: 2,
    maxTurns: 25,
    player: combatant(),
    boss: combatant({
      id: 'boss',
      name: 'Ogre',
      element: 'EARTH',
      currentHealth: 500,
      maxHealth: 900,
    }),
    ward: null,
    affixTheme: 'FIRE',
    defendingThisTurn: false,
    potionUsedThisTurn: false,
    isFinished: false,
    winner: null,
    lastTurnLogs: [],
    allLogs: [],
    ...overrides,
  };
}

const victory = () =>
  turnState({
    isFinished: true,
    winner: 'TEAM_A',
    boss: combatant({ name: 'Ogre', currentHealth: 0, maxHealth: 900 }),
  });
const defeat = () =>
  turnState({ isFinished: true, winner: 'TEAM_B', player: combatant({ currentHealth: 0 }) });

function fakeSession(
  states: Array<ReturnType<typeof turnState>>,
  extra: Record<string, unknown> = {},
) {
  const script = [...states];
  let index = 0;
  const advance = () => {
    index = Math.min(index + 1, script.length - 1);
    return script[index]!;
  };
  return {
    floorNumber: 1,
    seasonId: 's1',
    userId: 'u1',
    bossProfile: null,
    getSnapshot: () => script[index]!,
    executeTurn: vi.fn(advance),
    executeAutoTurn: vi.fn(advance),
    executeItemTurn: vi.fn(advance),
    forfeit: vi.fn(() => {
      script.push(defeat());
      index = script.length - 1;
    }),
    ...extra,
  };
}

function fakeMessage() {
  const collector = Object.assign(new EventEmitter(), {
    stop: vi.fn(function (this: EventEmitter, reason: string) {
      this.emit('end', [], reason);
    }),
  });
  const message = {
    edit: vi.fn().mockResolvedValue(undefined),
    createMessageComponentCollector: vi.fn(() => collector),
  };
  return { message, collector };
}

function component(customId: string, userId = 'u1') {
  return {
    user: { id: userId },
    customId,
    values: [] as string[],
    isStringSelectMenu: () => false,
    isButton: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
  };
}

function selectMenu(value: string, customId = 'dungeon:action:use_item', userId = 'u1') {
  return {
    ...component(customId, userId),
    values: [value],
    isStringSelectMenu: () => true,
    isButton: () => false,
  };
}

const runResult = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  victory: true,
  floorNumber: 1,
  seasonId: 's1',
  energySpent: 10,
  turnsTotal: 4,
  logs: [],
  highestFloorCleared: 1,
  isFirstClear: true,
  cardExp: [],
  ...overrides,
});

describe('DungeonBattleManager (TASK-1254)', () => {
  let services: any;
  let manager: DungeonBattleManager;
  let sessions: ReturnType<typeof fakeSession>[];
  let reply: ReturnType<typeof vi.fn>;
  let ctx: any;
  let message: ReturnType<typeof fakeMessage>['message'];
  let collector: ReturnType<typeof fakeMessage>['collector'];

  const baseOptions = { floorNumber: 1, seasonId: 's1', mode: 'manual' as const };

  /** Fires the collector's collect handler and waits for it to finish. */
  const collect = (interaction: unknown) =>
    (collector.listeners('collect')[0] as (i: unknown) => Promise<void>)(interaction);

  const lastEmbed = (fn: ReturnType<typeof vi.fn>, call = -1) => {
    const calls = fn.mock.calls;
    const payload = calls[call < 0 ? calls.length + call : call]![0];
    return payload.embeds[0].data;
  };

  const customIds = (rows: any[]) =>
    rows.flatMap((row) => row.components.map((c: any) => c.data.custom_id));

  beforeEach(() => {
    ({ message, collector } = fakeMessage());
    reply = vi.fn().mockResolvedValue(message);
    ctx = { user: { id: 'u1' }, reply };
    sessions = [fakeSession([turnState(), turnState({ turn: 3 }), victory()])];

    services = {
      loadoutService: { buildActiveParty: vi.fn().mockResolvedValue([{ id: 'uc1' }]) },
      waifuCardRepo: {
        findUserCardById: vi.fn().mockResolvedValue({ id: 'uc1', cardId: 'card-1' }),
        findById: vi.fn().mockResolvedValue({ id: 'card-1', assetId: 'asset-1' }),
        count: vi.fn().mockResolvedValue(42),
        listUserCards: vi.fn().mockResolvedValue([]),
        updateUserCardState: vi.fn().mockResolvedValue(undefined),
      },
      waifuAssetRepo: { findById: vi.fn().mockResolvedValue({ id: 'asset-1' }) },
      cardImageService: { getCardImage: vi.fn().mockResolvedValue(Buffer.from('card')) },
      bossImageService: { getBossImage: vi.fn().mockResolvedValue(Buffer.from('boss')) },
      dungeonRunner: {
        createBattleSession: vi.fn(async () => ({
          success: true,
          energySpent: 10,
          session: sessions.shift() ?? fakeSession([turnState()]),
        })),
        finalizeBattleResult: vi.fn().mockResolvedValue(runResult()),
      },
      tutorialService: {
        getTutorialFloor: vi
          .fn()
          .mockReturnValue({
            title: 'First Steps',
            topic: 'Attacks',
            guideMessage: 'Press attack',
          }),
        completeTutorial: vi.fn().mockResolvedValue({ message: 'Tutorial graduated!' }),
        handleTutorialFloor3Victory: vi
          .fn()
          .mockResolvedValue({ granted: true, message: 'Floor 3 reward granted' }),
        handleTutorialFloor4Defeat: vi.fn().mockResolvedValue(undefined),
      },
      dungeonSeasonRepo: { findActiveSeason: vi.fn().mockResolvedValue(null) },
      userDungeonProgressRepo: {
        getOrCreateProgress: vi.fn().mockResolvedValue({ highestClearedFloor: 6 }),
      },
      userInventoryItemRepo: {
        findByUser: vi.fn().mockResolvedValue([]),
        findById: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      },
      gameItemRepo: { findById: vi.fn() },
    };
    manager = new DungeonBattleManager(services as BotServices);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('starting a battle', () => {
    it('tells a player without an active card to claim or equip one', async () => {
      services.loadoutService.buildActiveParty.mockResolvedValue([]);
      await manager.startBattle(ctx, baseOptions);
      expect(reply).toHaveBeenCalledWith({
        content: expect.stringContaining('You have no cards available to climb the dungeon'),
        ephemeral: true,
      });
      expect(services.dungeonRunner.createBattleSession).not.toHaveBeenCalled();
    });

    it('shows why the session could not be created', async () => {
      services.dungeonRunner.createBattleSession.mockResolvedValue({
        success: false,
        error: 'Not enough energy',
      });
      await manager.startBattle(ctx, baseOptions);
      expect(reply).toHaveBeenCalledWith({
        content: '❌ **Climb Failed**: Not enough energy',
        ephemeral: true,
      });

      services.dungeonRunner.createBattleSession.mockResolvedValue({ success: false });
      await manager.startBattle(ctx, baseOptions);
      expect(reply).toHaveBeenLastCalledWith({
        content: '❌ **Climb Failed**: Unable to start dungeon session.',
        ephemeral: true,
      });
    });

    it('does not charge energy for the tutorial', async () => {
      await manager.startBattle(ctx, { ...baseOptions, isTutorial: true });
      expect(services.dungeonRunner.createBattleSession).toHaveBeenCalledWith(
        expect.objectContaining({ skipEnergyDeduction: true, floorNumber: 1 }),
      );
    });

    it('renders the boss portrait as the image and the card as the thumbnail', async () => {
      sessions[0] = fakeSession([turnState({ turn: 1 })], {
        bossProfile: {
          id: 'b1',
          name: 'Ogre',
          animeTitle: 'Ogre Saga',
          title: 'The Brute',
          flavorText: 'Smash everything.',
        },
      });
      await manager.startBattle(ctx, baseOptions);

      expect(services.cardImageService.getCardImage).toHaveBeenCalledWith(
        { id: 'card-1', assetId: 'asset-1' },
        { id: 'asset-1' },
        { attributionText: 'Ririko AI 2.0 Waifu TCG', maxCollectionNumber: 42 },
      );
      const payload = reply.mock.calls[0]![0];
      expect(payload.files.map((f: any) => f.name)).toEqual(['player_card.png', 'boss.png']);
      const embed = payload.embeds[0].data;
      expect(embed.image.url).toBe('attachment://boss.png');
      expect(embed.thumbnail.url).toBe('attachment://player_card.png');
      expect(embed.description).toContain('*The Brute* (Ogre Saga)');
      expect(embed.description).toContain('> Smash everything.');
      expect(embed.title).toBe('🏰 Floor 1 — Ogre vs Hero (Turn 1/25)');
      expect(embed.footer.text).toContain('Manual actions or click Auto');
      expect(customIds(payload.components)).toEqual([
        'dungeon:action:attack',
        'dungeon:action:skill',
        'dungeon:action:defend',
        'dungeon:action:auto',
        'dungeon:action:flee',
        'dungeon:action:use_item',
      ]);
    });

    it('uses the card image as the main image when there is no boss portrait', async () => {
      services.bossImageService.getBossImage.mockResolvedValue(null);
      sessions[0] = fakeSession([turnState()], { bossProfile: { id: 'b1', name: 'Ogre' } });
      await manager.startBattle(ctx, baseOptions);
      const payload = reply.mock.calls[0]![0];
      expect(payload.files.map((f: any) => f.name)).toEqual(['player_card.png']);
      expect(payload.embeds[0].data.image.url).toBe('attachment://player_card.png');
      expect(payload.embeds[0].data.thumbnail).toBeUndefined();
    });

    it('still starts the climb when the card or boss image fails to render', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      services.cardImageService.getCardImage.mockRejectedValue(new Error('canvas'));
      services.bossImageService.getBossImage.mockRejectedValue(new Error('canvas'));
      sessions[0] = fakeSession([turnState()], { bossProfile: { id: 'b1', name: 'Ogre' } });
      await manager.startBattle(ctx, baseOptions);

      expect(warn).toHaveBeenCalledTimes(2);
      const payload = reply.mock.calls[0]![0];
      expect(payload.files).toEqual([]);
      expect(payload.embeds[0].data.image).toBeUndefined();
    });

    it('falls back to the card id and skips images when the repositories lack lookups', async () => {
      services.waifuCardRepo = {};
      services.cardImageService = undefined;
      services.bossImageService = undefined;
      await manager.startBattle(ctx, baseOptions);
      const payload = reply.mock.calls[0]![0];
      expect(payload.files).toEqual([]);
      expect(message.createMessageComponentCollector).toHaveBeenCalledWith({ time: 180_000 });
    });

    it('renders without an asset or card total when those lookups are unavailable', async () => {
      services.waifuCardRepo.findById.mockResolvedValue({ id: 'card-1', assetId: null });
      delete services.waifuCardRepo.count;
      await manager.startBattle(ctx, baseOptions);
      expect(services.cardImageService.getCardImage).toHaveBeenCalledWith(
        expect.anything(),
        null,
        expect.objectContaining({ maxCollectionNumber: 0 }),
      );
    });

    it('shows the ward, status effects, guard state and combat feed', async () => {
      sessions[0] = fakeSession([
        turnState({
          defendingThisTurn: true,
          ward: { active: true, element: 'ICE', currentHealth: 30, maxHealth: 60 },
          player: combatant({ statusEffects: [{ type: 'BURN', duration: 2 }] }),
          boss: combatant({
            name: 'Ogre',
            maxHealth: 900,
            currentHealth: 450,
            statusEffects: [{ type: 'FREEZE', duration: 1 }],
          }),
          lastTurnLogs: [{ turn: 0, message: 'Hero strikes' }],
        }),
      ]);
      await manager.startBattle(ctx, baseOptions);
      const description = reply.mock.calls[0]![0].embeds[0].data.description;
      expect(description).toContain('*(Guarding — 50% dmg reduction)*');
      expect(description).toContain('Ward Layer [ICE]');
      expect(description).toContain('30/60 HP');
      expect(description).toContain('`BURN (2t)`');
      expect(description).toContain('`FREEZE (1t)`');
      expect(description).toContain('• Turn 2: Hero strikes');
      expect(description).toContain('[█████░░░░░]');
    });

    it('shows the recent log when there are no logs for the last turn, and a barrier ward', async () => {
      sessions[0] = fakeSession([
        turnState({
          ward: { active: true, currentHealth: 10, maxHealth: 20 },
          allLogs: [{ turn: 1, message: 'an old log' }],
        }),
      ]);
      await manager.startBattle(ctx, baseOptions);
      const description = reply.mock.calls[0]![0].embeds[0].data.description;
      expect(description).toContain('Ward Layer [BARRIER]');
      expect(description).toContain('• Turn 1: an old log');
    });

    it('renders a tutorial floor with its lesson and topic', async () => {
      sessions[0] = fakeSession([turnState()], { seasonId: 'season_tutorial', floorNumber: 2 });
      await manager.startBattle(ctx, { ...baseOptions, isTutorial: true, floorNumber: 2 });
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.title).toContain('Tutorial Floor T2 [Attacks]');
      expect(embed.description).toContain('Tactical Lesson');
      expect(embed.description).toContain('Press attack');
    });

    it('edits an existing message and defers the interaction that triggered it', async () => {
      const interaction = component('dungeon:action:next');
      await manager.startBattle(ctx, {
        ...baseOptions,
        existingMessage: message as any,
        interaction: interaction as any,
      });
      expect(interaction.deferUpdate).toHaveBeenCalled();
      expect(message.edit).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: [expect.anything()], files: expect.any(Array) }),
      );
      expect(reply).not.toHaveBeenCalled();
    });

    it('fetches the reply when Discord returns an interaction response', async () => {
      const fetched = fakeMessage();
      reply.mockResolvedValue({ fetch: vi.fn().mockResolvedValue(fetched.message) });
      await manager.startBattle(ctx, baseOptions);
      expect(fetched.message.createMessageComponentCollector).toHaveBeenCalled();
    });

    it('stops quietly when the reply is not a message with a collector', async () => {
      reply.mockResolvedValue(undefined);
      await manager.startBattle(ctx, baseOptions);
      expect(services.dungeonRunner.finalizeBattleResult).not.toHaveBeenCalled();
    });

    it('lists the potions the player owns in the item menu', async () => {
      services.userInventoryItemRepo.findByUser.mockResolvedValue([
        { id: 'inv-hp', itemId: 'hp', quantity: 2 },
        { id: 'inv-mp', itemId: 'mp', quantity: 1 },
        { id: 'inv-empty', itemId: 'hp', quantity: 0 },
        { id: 'inv-gone', itemId: 'gone', quantity: 1 },
        { id: 'inv-sword', itemId: 'sword', quantity: 1 },
      ]);
      const defs: Record<string, unknown> = {
        hp: { id: 'hp', name: 'Small Potion', type: 'CONSUMABLE', subtype: 'HP_POTION' },
        mp: {
          id: 'mp',
          name: 'Mana Drop',
          type: 'CONSUMABLE',
          subtype: 'MANA_POTION',
          description: 'Refills mana',
        },
        sword: { id: 'sword', name: 'Sword', type: 'EQUIPMENT', subtype: 'WEAPON' },
      };
      services.gameItemRepo.findById.mockImplementation(async (id: string) => defs[id] ?? null);

      await manager.startBattle(ctx, baseOptions);

      expect(services.userInventoryItemRepo.findByUser).toHaveBeenCalledWith('u1', {
        state: 'IDLE',
      });
      const menuBuilder = reply.mock.calls[0]![0].components[1].components[0];
      const menu = { ...menuBuilder.data, options: menuBuilder.options.map((o: any) => o.data) };
      expect(menu.disabled).toBeFalsy();
      expect(menu.options).toEqual([
        {
          label: '🧪 Small Potion (x2)',
          description: 'Restores HP (Free Action)',
          value: 'inv-hp',
        },
        { label: '🔷 Mana Drop (x1)', description: 'Refills mana', value: 'inv-mp' },
      ]);
    });

    it('disables the item menu with no potions, and after a potion was used this turn', async () => {
      await manager.startBattle(ctx, baseOptions);
      const empty = reply.mock.calls[0]![0].components[1].components[0];
      expect(empty.data.disabled).toBe(true);
      expect(empty.options[0].data.value).toBe('none');

      sessions.push(fakeSession([turnState({ potionUsedThisTurn: true })]));
      ({ message, collector } = fakeMessage());
      reply.mockResolvedValue(message);
      await manager.startBattle(ctx, baseOptions);
      const used = reply.mock.calls[1]![0].components[1].components[0];
      expect(used.data.disabled).toBe(true);
      expect(used.options[0].data.value).toBe('already_used');
    });

    it('offers no potions when the inventory repositories are unavailable', async () => {
      services.userInventoryItemRepo = undefined;
      await manager.startBattle(ctx, baseOptions);
      expect(reply.mock.calls[0]![0].components[1].components[0].options[0].data.value).toBe(
        'none',
      );
    });

    it('disables the skill button when the card cannot afford it', async () => {
      sessions[0] = fakeSession([turnState({ player: combatant({ currentMp: 5 }) })]);
      await manager.startBattle(ctx, baseOptions);
      const skill = reply.mock.calls[0]![0].components[0].components[1].data;
      expect(skill.disabled).toBe(true);
      expect(skill.label).toBe('✨ Blaze (30 MP)');
    });
  });

  describe('manual combat', () => {
    beforeEach(async () => {
      await manager.startBattle(ctx, baseOptions);
    });

    it('refuses buttons pressed by someone else', async () => {
      const intruder = component('dungeon:action:attack', 'u2');
      await collect(intruder);
      expect(intruder.reply).toHaveBeenCalledWith({
        content: '⏳ This is not your dungeon battle!',
        ephemeral: true,
      });
      expect(sessions.length).toBe(0);
    });

    it.each([
      ['dungeon:action:attack', 'ATTACK'],
      ['dungeon:action:skill', 'SKILL'],
      ['dungeon:action:defend', 'DEFEND'],
    ])('%s plays a %s turn and refreshes the battle view', async (id, action) => {
      const session = (await services.dungeonRunner.createBattleSession.mock.results[0].value)
        .session;
      const click = component(id);
      await collect(click);
      expect(session.executeTurn).toHaveBeenCalledWith(action);
      expect(click.update).toHaveBeenCalledTimes(1);
      const payload = click.update.mock.calls[0]![0];
      expect(payload.embeds[0].data.title).toContain('Turn 3/25');
      expect(customIds(payload.components)).toContain('dungeon:action:use_item');
    });

    it('ignores components it does not know', async () => {
      const unknown = component('dungeon:action:mystery');
      await collect(unknown);
      expect(unknown.deferUpdate).toHaveBeenCalled();
      expect(unknown.update).not.toHaveBeenCalled();

      const other = { ...component('x'), isButton: () => false, isStringSelectMenu: () => false };
      await collect(other);
      expect(other.deferUpdate).toHaveBeenCalled();
    });

    it('finishes the battle on the killing blow with the victory report and next-floor button', async () => {
      services.dungeonRunner.finalizeBattleResult.mockResolvedValue(
        runResult({
          loot: { message: '🎁 Loot: 100 credits' },
          cardExp: [
            {
              cardName: 'Flame Valkyrie',
              expGained: 50,
              levelsGained: 1,
              previousLevel: 4,
              newLevel: 5,
              expToNextLevel: 20,
            },
          ],
          progress: {
            stars: 2,
            bestStars: 2,
            threeStarDust: 0,
            nextPityBonus: 0,
            energyRefunded: 0,
          },
        }),
      );
      const click = component('dungeon:action:attack');
      await collect(click);
      await collect(component('dungeon:action:attack'));
      const final = component('dungeon:action:attack');
      await collect(final);

      expect(services.dungeonRunner.finalizeBattleResult).toHaveBeenCalledWith(expect.anything(), {
        energySpent: 10,
      });
      const payload = final.update.mock.calls[0]![0];
      const embed = payload.embeds[0].data;
      expect(embed.title).toBe('🏆 Floor 1 CLEARED! — Victory!');
      expect(embed.color).toBe(0x57f287);
      expect(embed.description).toContain('✅ **VICTORY**');
      expect(embed.description).toContain('`4/25 Turns`');
      expect(embed.description).toContain('Loot: 100 credits');
      expect(embed.description).toContain('Level Up! Lv.4 → Lv.5');
      expect(embed.description).toContain('2/3 stars');
      expect(customIds(payload.components)).toEqual([
        'dungeon:action:next',
        'dungeon:action:status',
      ]);
      expect(payload.components[0].components[0].data.label).toBe('⚔️ Next Floor (Floor 2)');
    });

    it('forfeiting ends the battle as a defeat with retry offered', async () => {
      services.dungeonRunner.finalizeBattleResult.mockResolvedValue(runResult({ victory: false }));
      const flee = component('dungeon:action:flee');
      await collect(flee);
      const payload = flee.update.mock.calls[0]![0];
      expect(payload.embeds[0].data.title).toBe('💀 Floor 1 Defeat');
      expect(payload.embeds[0].data.color).toBe(0xed4245);
      expect(payload.embeds[0].data.description).toContain('❌ **DEFEATED**');
      expect(customIds(payload.components)).toEqual([
        'dungeon:action:retry',
        'dungeon:action:status',
      ]);
    });

    it('skip fast-forwards to the end', async () => {
      const session = (await services.dungeonRunner.createBattleSession.mock.results[0].value)
        .session;
      const skip = component('dungeon:action:skip');
      await collect(skip);
      expect(session.executeAutoTurn).toHaveBeenCalledTimes(2);
      expect(skip.update.mock.calls[0]![0].embeds[0].data.title).toContain('CLEARED');
    });

    it('status explains where to see the tower standing', async () => {
      const status = component('dungeon:action:status');
      await collect(status);
      expect(status.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('/dungeon status'),
        ephemeral: true,
      });
    });

    it('pausing switches the controls back to manual', async () => {
      const pause = component('dungeon:action:pause');
      await collect(pause);
      expect(customIds(pause.update.mock.calls[0]![0].components)).toContain(
        'dungeon:action:attack',
      );
    });
  });

  describe('items during combat', () => {
    beforeEach(async () => {
      await manager.startBattle(ctx, baseOptions);
    });

    it('ignores the placeholder options', async () => {
      for (const value of ['none', 'already_used']) {
        const pick = selectMenu(value);
        await collect(pick);
        expect(pick.deferUpdate).toHaveBeenCalled();
        expect(pick.reply).not.toHaveBeenCalled();
      }
    });

    it('allows one potion per turn', async () => {
      sessions.length = 0;
      const session = (await services.dungeonRunner.createBattleSession.mock.results[0].value)
        .session;
      session.getSnapshot = () => turnState({ potionUsedThisTurn: true });
      const pick = selectMenu('inv-1');
      await collect(pick);
      expect(pick.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('only use 1 potion per turn'),
        ephemeral: true,
      });
      expect(services.userInventoryItemRepo.findById).not.toHaveBeenCalled();
    });

    it.each([
      ['a missing item', null],
      ["another player's item", { id: 'inv-1', userId: 'u2', itemId: 'hp', quantity: 1 }],
      ['an empty stack', { id: 'inv-1', userId: 'u1', itemId: 'hp', quantity: 0 }],
    ])('refuses %s', async (_label, row) => {
      services.userInventoryItemRepo.findById.mockResolvedValue(row);
      const pick = selectMenu('inv-1');
      await collect(pick);
      expect(pick.reply).toHaveBeenCalledWith({
        content: '❌ That potion is no longer available in your inventory!',
        ephemeral: true,
      });
      expect(services.userInventoryItemRepo.delete).not.toHaveBeenCalled();
    });

    it('refuses a potion whose definition was removed', async () => {
      services.userInventoryItemRepo.findById.mockResolvedValue({
        id: 'inv-1',
        userId: 'u1',
        itemId: 'hp',
        quantity: 1,
      });
      services.gameItemRepo.findById.mockResolvedValue(null);
      const pick = selectMenu('inv-1');
      await collect(pick);
      expect(pick.reply).toHaveBeenCalledWith({
        content: '❌ Item definition not found.',
        ephemeral: true,
      });
    });

    it('drinks one potion from a stack and refreshes the view', async () => {
      const potion = { id: 'hp', name: 'Small Potion', type: 'CONSUMABLE', subtype: 'HP_POTION' };
      services.userInventoryItemRepo.findById.mockResolvedValue({
        id: 'inv-1',
        userId: 'u1',
        itemId: 'hp',
        quantity: 3,
      });
      services.gameItemRepo.findById.mockResolvedValue(potion);
      const session = (await services.dungeonRunner.createBattleSession.mock.results[0].value)
        .session;
      const pick = selectMenu('inv-1');
      await collect(pick);

      expect(services.userInventoryItemRepo.update).toHaveBeenCalledWith('inv-1', { quantity: 2 });
      expect(services.userInventoryItemRepo.delete).not.toHaveBeenCalled();
      expect(session.executeItemTurn).toHaveBeenCalledWith(potion);
      expect(pick.update).toHaveBeenCalledTimes(1);
    });

    it('consumes the last potion and ends the battle if it decides it', async () => {
      services.userInventoryItemRepo.findById.mockResolvedValue({
        id: 'inv-1',
        userId: 'u1',
        itemId: 'hp',
        quantity: 1,
      });
      services.gameItemRepo.findById.mockResolvedValue({ id: 'hp', name: 'Potion' });
      const session = (await services.dungeonRunner.createBattleSession.mock.results[0].value)
        .session;
      session.executeItemTurn.mockReturnValue(victory());
      // The session reports finished after the item turn.
      let finished = false;
      session.getSnapshot = () => (finished ? victory() : turnState());
      session.executeItemTurn.mockImplementation(() => {
        finished = true;
        return victory();
      });
      const pick = selectMenu('inv-1');
      await collect(pick);

      expect(services.userInventoryItemRepo.delete).toHaveBeenCalledWith('inv-1');
      expect(services.dungeonRunner.finalizeBattleResult).toHaveBeenCalled();
      expect(pick.update.mock.calls[0]![0].embeds[0].data.title).toContain('CLEARED');
    });
  });

  describe('auto mode', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('plays a turn every 1.5 seconds and finalizes when the fight ends', async () => {
      sessions[0] = fakeSession([turnState(), turnState({ turn: 3 }), victory()]);
      await manager.startBattle(ctx, { ...baseOptions, mode: 'auto' });
      const session = (await services.dungeonRunner.createBattleSession.mock.results[0].value)
        .session;
      expect(customIds(reply.mock.calls[0]![0].components)).toEqual([
        'dungeon:action:pause',
        'dungeon:action:skip',
        'dungeon:action:flee',
      ]);

      await vi.advanceTimersByTimeAsync(1500);
      expect(session.executeAutoTurn).toHaveBeenCalledTimes(1);
      expect(lastEmbed(message.edit).title).toContain('Turn 3/25');

      await vi.advanceTimersByTimeAsync(1500);
      expect(session.executeAutoTurn).toHaveBeenCalledTimes(2);
      expect(services.dungeonRunner.finalizeBattleResult).toHaveBeenCalledTimes(1);
      expect(lastEmbed(message.edit).title).toContain('CLEARED');
    });

    it('stops the loop when the player pauses', async () => {
      await manager.startBattle(ctx, { ...baseOptions, mode: 'auto' });
      const session = (await services.dungeonRunner.createBattleSession.mock.results[0].value)
        .session;
      await collect(component('dungeon:action:pause'));
      await vi.advanceTimersByTimeAsync(5000);
      expect(session.executeAutoTurn).not.toHaveBeenCalled();
    });

    it('switching to auto from manual starts the loop', async () => {
      await manager.startBattle(ctx, baseOptions);
      const session = (await services.dungeonRunner.createBattleSession.mock.results[0].value)
        .session;
      const auto = component('dungeon:action:auto');
      await collect(auto);
      expect(customIds(auto.update.mock.calls[0]![0].components)).toEqual([
        'dungeon:action:pause',
        'dungeon:action:skip',
        'dungeon:action:flee',
      ]);
      await vi.advanceTimersByTimeAsync(1500);
      expect(session.executeAutoTurn).toHaveBeenCalledTimes(1);
    });
  });

  describe('moving between floors', () => {
    it('the next-floor button starts the next floor on the same message', async () => {
      await manager.startBattle(ctx, { ...baseOptions, floorNumber: 3 });
      const next = component('dungeon:action:next');
      await collect(next);
      expect(collector.stop).toHaveBeenCalledWith('restarting');
      expect(services.dungeonRunner.createBattleSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ floorNumber: 4, seasonId: 's1' }),
      );
      expect(next.deferUpdate).toHaveBeenCalled();
      expect(message.edit).toHaveBeenCalled();
    });

    it('retry replays the same floor', async () => {
      await manager.startBattle(ctx, { ...baseOptions, floorNumber: 5 });
      await collect(component('dungeon:action:retry'));
      expect(services.dungeonRunner.createBattleSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ floorNumber: 5 }),
      );
    });

    it('graduating the tutorial continues at the first uncleared season floor', async () => {
      await manager.startBattle(ctx, {
        floorNumber: 4,
        seasonId: 'season_tutorial',
        mode: 'manual',
        isTutorial: true,
      });
      await collect(component('dungeon:action:next'));
      expect(services.userDungeonProgressRepo.getOrCreateProgress).toHaveBeenCalledWith(
        'u1',
        's1_infernal_crucible',
      );
      expect(services.dungeonRunner.createBattleSession).toHaveBeenLastCalledWith(
        expect.objectContaining({
          floorNumber: 7,
          seasonId: 's1_infernal_crucible',
          skipEnergyDeduction: false,
        }),
      );
    });

    it('the tutorial next button before floor 4 stays in the tutorial', async () => {
      await manager.startBattle(ctx, {
        floorNumber: 2,
        seasonId: 'season_tutorial',
        mode: 'manual',
        isTutorial: true,
      });
      await collect(component('dungeon:action:next'));
      expect(services.dungeonRunner.createBattleSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ floorNumber: 3, seasonId: 'season_tutorial' }),
      );
    });

    it('Enter Season 1 uses the active season when there is one', async () => {
      services.dungeonSeasonRepo.findActiveSeason.mockResolvedValue({ id: 's2_frost', name: 'S2' });
      await manager.startBattle(ctx, {
        floorNumber: 4,
        seasonId: 'season_tutorial',
        mode: 'manual',
        isTutorial: true,
      });
      await collect(component('dungeon:action:enter_season_1'));
      expect(services.dungeonRunner.createBattleSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ floorNumber: 7, seasonId: 's2_frost' }),
      );
    });

    it('Equip & Retry swaps the equipped card before replaying the floor', async () => {
      services.waifuCardRepo.listUserCards.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]);
      await manager.startBattle(ctx, { ...baseOptions, floorNumber: 4 });
      await collect(component('dungeon:action:equip_retry:uc-counter'));

      expect(services.waifuCardRepo.listUserCards).toHaveBeenCalledWith('u1', {
        state: 'EQUIPPED',
      });
      expect(services.waifuCardRepo.updateUserCardState.mock.calls).toEqual([
        ['old-1', 'IDLE'],
        ['old-2', 'IDLE'],
        ['uc-counter', 'EQUIPPED'],
      ]);
      expect(services.dungeonRunner.createBattleSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ floorNumber: 4 }),
      );
    });
  });

  describe('tutorial endings', () => {
    const tutorialOptions = (floorNumber: number) => ({
      floorNumber,
      seasonId: 'season_tutorial',
      mode: 'manual' as const,
      isTutorial: true,
    });

    it('graduating on floor 4 appends the completion message and offers Season 1', async () => {
      sessions[0] = fakeSession([turnState(), victory()], {
        seasonId: 'season_tutorial',
        floorNumber: 4,
      });
      await manager.startBattle(ctx, tutorialOptions(4));
      const attack = component('dungeon:action:attack');
      await collect(attack);

      expect(services.tutorialService.completeTutorial).toHaveBeenCalledWith('u1');
      const payload = attack.update.mock.calls[0]![0];
      const embed = payload.embeds[0].data;
      expect(embed.title).toBe('🎉 Prologue Tutorial CLEARED! — Training Grounds Mastered!');
      expect(embed.description).toContain('Tutorial graduated!');
      expect(embed.footer.text).toContain('Enter Season 1');
      expect(customIds(payload.components)).toEqual([
        'dungeon:action:enter_season_1',
        'dungeon:action:status',
      ]);
    });

    it('clearing floor 3 grants its reward, and a refused reward adds no message', async () => {
      sessions.push(
        fakeSession([turnState(), victory()], { seasonId: 'season_tutorial', floorNumber: 3 }),
        fakeSession([turnState(), victory()], { seasonId: 'season_tutorial', floorNumber: 3 }),
      );
      sessions.shift();
      await manager.startBattle(ctx, tutorialOptions(3));
      const first = component('dungeon:action:attack');
      await collect(first);
      expect(services.tutorialService.handleTutorialFloor3Victory).toHaveBeenCalledWith('u1');
      expect(first.update.mock.calls[0]![0].embeds[0].data.description).toContain(
        'Floor 3 reward granted',
      );
      expect(first.update.mock.calls[0]![0].embeds[0].data.title).toContain(
        'Tutorial Floor T3 CLEARED! — First Steps',
      );

      ({ message, collector } = fakeMessage());
      reply.mockResolvedValue(message);
      services.tutorialService.handleTutorialFloor3Victory.mockResolvedValue({ granted: false });
      await manager.startBattle(ctx, tutorialOptions(3));
      const second = component('dungeon:action:attack');
      await collect(second);
      expect(second.update.mock.calls[0]![0].embeds[0].data.description).not.toContain(
        'reward granted',
      );
    });

    it('losing floor 4 teaches the elemental ward and offers the counter card', async () => {
      services.tutorialService.handleTutorialFloor4Defeat.mockResolvedValue({
        bossElement: 'ICE',
        counterCard: { name: 'Ember Maiden' },
        userCard: { id: 'uc-ember' },
        isNewGrant: true,
        alreadyOwned: false,
        alreadyEquipped: false,
      });
      services.dungeonRunner.finalizeBattleResult.mockResolvedValue(runResult({ victory: false }));
      sessions[0] = fakeSession([turnState(), defeat()], {
        seasonId: 'season_tutorial',
        floorNumber: 4,
      });
      await manager.startBattle(ctx, tutorialOptions(4));
      const attack = component('dungeon:action:attack');
      await collect(attack);

      expect(services.tutorialService.handleTutorialFloor4Defeat).toHaveBeenCalledWith(
        'u1',
        'EARTH',
      );
      const payload = attack.update.mock.calls[0]![0];
      const embed = payload.embeds[0].data;
      expect(embed.title).toBe('💀 Tutorial Floor T4 Defeat');
      expect(embed.description).toContain('Type Disadvantage & Elemental Wards');
      expect(embed.description).toContain('Counter Reinforcement Dispatched');
      expect(embed.description).toContain('Ember Maiden [ICE]');
      expect(customIds(payload.components)).toEqual([
        'dungeon:action:equip_retry:uc-ember',
        'dungeon:action:retry',
        'dungeon:action:status',
      ]);
      expect(payload.components[0].components[0].data.label).toBe('⚔️ Equip Ember Maiden & Retry');
    });

    it('tells the player to bring the right element when no counter card exists', async () => {
      services.tutorialService.handleTutorialFloor4Defeat.mockResolvedValue({
        bossElement: 'ICE',
        counterCard: null,
        userCard: null,
        isNewGrant: false,
        alreadyOwned: false,
      });
      services.dungeonRunner.finalizeBattleResult.mockResolvedValue(runResult({ victory: false }));
      sessions[0] = fakeSession([turnState(), defeat()], {
        seasonId: 'season_tutorial',
        floorNumber: 4,
      });
      await manager.startBattle(ctx, tutorialOptions(4));
      const attack = component('dungeon:action:attack');
      await collect(attack);
      const payload = attack.update.mock.calls[0]![0];
      expect(payload.embeds[0].data.description).toContain('Equip a **[ICE]** card');
      expect(customIds(payload.components)).toEqual([
        'dungeon:action:retry',
        'dungeon:action:status',
      ]);
    });

    it('a ready counter card is described as ready, and an equipped one has no equip button', async () => {
      services.tutorialService.handleTutorialFloor4Defeat.mockResolvedValue({
        bossElement: 'ICE',
        counterCard: { name: 'Ember Maiden' },
        userCard: { id: 'uc-ember' },
        isNewGrant: false,
        alreadyOwned: true,
        alreadyEquipped: true,
      });
      services.dungeonRunner.finalizeBattleResult.mockResolvedValue(runResult({ victory: false }));
      sessions[0] = fakeSession([turnState(), defeat()], {
        seasonId: 'season_tutorial',
        floorNumber: 4,
      });
      await manager.startBattle(ctx, tutorialOptions(4));
      const attack = component('dungeon:action:attack');
      await collect(attack);
      const payload = attack.update.mock.calls[0]![0];
      expect(payload.embeds[0].data.description).toContain('Counter Reinforcement Ready');
      expect(customIds(payload.components)).not.toContain('dungeon:action:equip_retry:uc-ember');
    });
  });

  describe('abandoned battles', () => {
    it('auto-resolves an idle climb when the collector times out', async () => {
      await manager.startBattle(ctx, baseOptions);
      const session = (await services.dungeonRunner.createBattleSession.mock.results[0].value)
        .session;
      collector.emit('end', [], 'time');
      await vi.waitFor(() =>
        expect(services.dungeonRunner.finalizeBattleResult).toHaveBeenCalled(),
      );
      expect(session.executeAutoTurn).toHaveBeenCalledTimes(2);
      await vi.waitFor(() => expect(message.edit).toHaveBeenCalled());
      expect(lastEmbed(message.edit).title).toContain('CLEARED');
    });

    it('does nothing when the collector ended because the battle restarted or finished', async () => {
      await manager.startBattle(ctx, baseOptions);
      collector.emit('end', [], 'restarting');
      collector.emit('end', [], 'battle_finished');
      expect(services.dungeonRunner.finalizeBattleResult).not.toHaveBeenCalled();
    });

    it('does not finalize twice when the battle already finished', async () => {
      sessions[0] = fakeSession([victory()]);
      await manager.startBattle(ctx, baseOptions);
      collector.emit('end', [], 'time');
      await Promise.resolve();
      expect(services.dungeonRunner.finalizeBattleResult).not.toHaveBeenCalled();
    });
  });
});
