import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createTcgInfoCommand,
  buildTcgInfoEmbed,
  buildTcgInfoSelectMenu,
  type TcgInfoTopic,
} from '../info.command.js';
import type { BotServices } from '../../../services.js';
import type { CommandContext } from '@ririko/discord';

describe('Waifu TCG Info & Player Guide Command Suite (/tcg-info)', () => {
  let services: BotServices;
  let replyMock: any;

  beforeEach(() => {
    replyMock = vi.fn().mockResolvedValue(undefined);
    services = {} as BotServices;
  });

  const createMockContext = (options: {
    topic?: string;
    rawArgs?: string[];
  }): CommandContext => {
    return {
      commandName: 'tcg-info',
      source: 'slash',
      user: {
        id: 'user_123',
        username: 'TestSummoner',
      },
      guild: {
        id: 'guild_123',
        name: 'TestGuild',
      },
      options: {
        getString: vi.fn((name: string) => {
          if (name === 'topic') return options.topic ?? null;
          return null;
        }),
        getInteger: vi.fn().mockReturnValue(null),
        getNumber: vi.fn().mockReturnValue(null),
        getBoolean: vi.fn().mockReturnValue(null),
        getUser: vi.fn().mockResolvedValue(null),
        getMember: vi.fn().mockResolvedValue(null),
        getChannel: vi.fn().mockReturnValue(null),
        getRole: vi.fn().mockReturnValue(null),
        getAttachment: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue(null),
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getRawArgs: vi.fn().mockReturnValue(options.rawArgs ?? []),
      },
      reply: replyMock,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      deleteReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
    } as unknown as CommandContext;
  };

  it('should have correct metadata, options, and aliases', () => {
    const cmd = createTcgInfoCommand(services);
    expect(cmd.metadata.name).toBe('tcg-info');
    expect(cmd.metadata.aliases).toContain('tcginfo');
    expect(cmd.metadata.aliases).toContain('tcgguide');
    expect(cmd.metadata.aliases).toContain('card-guide');
    expect(cmd.metadata.options?.[0]?.name).toBe('topic');
    expect(cmd.metadata.options?.[0]?.choices?.length).toBe(11);
  });

  it('should render the overview hub by default when no topic is provided', async () => {
    const cmd = createTcgInfoCommand(services);
    const ctx = createMockContext({});

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const callArgs = replyMock.mock.calls[0][0];
    expect(callArgs.embeds).toBeDefined();
    expect(callArgs.components).toBeDefined();

    const embed = callArgs.embeds[0];
    expect(embed.data.title).toContain('Information & Strategy Hub');
  });

  it('should render the starter card guide when topic is "starter"', async () => {
    const cmd = createTcgInfoCommand(services);
    const ctx = createMockContext({ topic: 'starter' });

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const embed = replyMock.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('Getting Started & Your First Card');
    expect(embed.data.description).toContain('/dungeon action:tutorial');
    expect(embed.data.description).toContain('/card action:claim');
  });

  it('should render the 7-element type advantages when topic is "elements"', async () => {
    const cmd = createTcgInfoCommand(services);
    const ctx = createMockContext({ topic: 'elements' });

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const embed = replyMock.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('7-Element Affinity Matrix & Status Effects');
    expect(embed.data.description).toContain('FIRE ──► ICE ──► EARTH ──► LIGHTNING ──► WATER ──► FIRE');
    expect(embed.data.description).toContain('2.0x mutual extreme damage');
    expect(embed.data.description).toContain('Freeze / Chill');
  });

  it('should render equipment and enhancement when topic is "gear"', async () => {
    const cmd = createTcgInfoCommand(services);
    const ctx = createMockContext({ topic: 'gear' });

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const embed = replyMock.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('Equipments, Accessories & +10 Enhancement');
    expect(embed.data.description).toContain('6 Gear Slots');
    expect(embed.data.description).toContain('Crafting Dust');
  });

  it('should render tutorial prologue warning when topic is "tutorial"', async () => {
    const cmd = createTcgInfoCommand(services);
    const ctx = createMockContext({ topic: 'tutorial' });

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const embed = replyMock.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('Tutorial Prologue vs. S1 Tower');
    expect(embed.data.description).toContain('Do NOT jump straight into');
    expect(embed.data.description).toContain('Novice Blade');
  });

  it('should render dungeon tower mechanics when topic is "dungeon"', async () => {
    const cmd = createTcgInfoCommand(services);
    const ctx = createMockContext({ topic: 'dungeon' });

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const embed = replyMock.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('PvE Seasonal Dungeon Tower');
    expect(embed.data.description).toContain('SCORCHED_EARTH');
    expect(embed.data.description).toContain('Multi-Layer Elemental Wards');
    expect(embed.data.description).toContain('Soft Enrage Clock');
  });

  it('should render P2P trading guide when topic is "trade"', async () => {
    const cmd = createTcgInfoCommand(services);
    const ctx = createMockContext({ topic: 'trade' });

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const embed = replyMock.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('Peer-to-Peer (P2P) Trading System');
    expect(embed.data.description).toContain('IN_TRADE State Locking');
    expect(embed.data.description).toContain('/trade action:request');
  });

  it('should render marketplace guide when topic is "market"', async () => {
    const cmd = createTcgInfoCommand(services);
    const ctx = createMockContext({ topic: 'market' });

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const embed = replyMock.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('Community Player Marketplace');
    expect(embed.data.description).toContain('5% Market Tax Sink');
    expect(embed.data.description).toContain('7-Day Auto-Expiration');
  });

  it('should render WaifuGuilds guide when topic is "guild"', async () => {
    const cmd = createTcgInfoCommand(services);
    const ctx = createMockContext({ topic: 'guild' });

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const embed = replyMock.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('WaifuGuilds & Factions');
    expect(embed.data.description).toContain('5,000 Credits');
    expect(embed.data.description).toContain('Guild Bank');
  });

  it('should render achievements guide when topic is "achievements"', async () => {
    const cmd = createTcgInfoCommand(services);
    const ctx = createMockContext({ topic: 'achievements' });

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const embed = replyMock.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('Achievements & Multi-Asset Rewards');
    expect(embed.data.description).toContain('6 Achievement Tracks');
    expect(embed.data.description).toContain('7-Asset Multi-Reward Engine');
  });

  it('should parse topic from rawArgs in prefix commands ($tcg-info elements)', async () => {
    const cmd = createTcgInfoCommand(services);
    const ctx = createMockContext({ rawArgs: ['elements'] });

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const embed = replyMock.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('7-Element Affinity Matrix & Status Effects');
  });

  it('should fall back to overview if an invalid topic is provided', async () => {
    const cmd = createTcgInfoCommand(services);
    const ctx = createMockContext({ topic: 'nonexistent_topic' });

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const embed = replyMock.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('Information & Strategy Hub');
  });

  it('buildTcgInfoEmbed should generate valid embeds for all topics', () => {
    const topics: TcgInfoTopic[] = [
      'overview',
      'starter',
      'elements',
      'gear',
      'crafting',
      'tutorial',
      'dungeon',
      'trade',
      'market',
      'guild',
      'achievements',
    ];

    for (const t of topics) {
      const embed = buildTcgInfoEmbed(t);
      expect(embed.data.title).toBeTruthy();
      expect(embed.data.description).toBeTruthy();
    }
  });

  it('buildTcgInfoSelectMenu should generate a select menu with 10 options', () => {
    const row = buildTcgInfoSelectMenu('elements');
    expect(row.components.length).toBe(1);
    const menu = row.components[0] as any;
    expect(menu.options.length).toBe(11);
  });
});
