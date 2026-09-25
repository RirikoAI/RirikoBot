import { describe, it, expect, vi } from 'vitest';
import {
  ToolRegistry,
  TimeTool,
  CoinFlipTool,
  AnimeSearchTool,
  ReminderTool,
  MusicPlayTool,
  EconomyBalanceTool,
} from './index.js';
import type { ToolExecutionContext } from './types.js';

describe('AI Tools & Explicit Clock Service (TASK-0621)', () => {
  const baseContext: ToolExecutionContext = {
    userId: 'user-123',
    guildId: 'guild-456',
    channelId: 'channel-789',
  };

  describe('1. TimeTool (get_current_time)', () => {
    const timeTool = new TimeTool();

    it('resolves explicit argument timezone first', async () => {
      const context: ToolExecutionContext = {
        ...baseContext,
        userTimezone: 'Europe/London',
        guildTimezone: 'America/Chicago',
      };

      const result = await timeTool.execute({ timezone: 'Asia/Tokyo' }, context);
      expect(result.timezone).toBe('Asia/Tokyo');
      expect(result.iso).toBeDefined();
      expect(result.formatted).toContain('2026');
      expect(result.utcOffset).toMatch(/GMT\+9|UTC\+9|\+09:00/);
    });

    it('falls back to user preference timezone when argument is omitted', async () => {
      const context: ToolExecutionContext = {
        ...baseContext,
        userTimezone: 'America/New_York',
        guildTimezone: 'Europe/Paris',
      };

      const result = await timeTool.execute({}, context);
      expect(result.timezone).toBe('America/New_York');
      expect(result.utcOffset).toMatch(/GMT-4|GMT-5|UTC-4|UTC-5|-04:00|-05:00/);
    });

    it('falls back to guild timezone when user timezone is omitted', async () => {
      const context: ToolExecutionContext = {
        ...baseContext,
        guildTimezone: 'Europe/Berlin',
      };

      const result = await timeTool.execute({}, context);
      expect(result.timezone).toBe('Europe/Berlin');
    });

    it('falls back to UTC when no timezone is configured or timezone is invalid', async () => {
      const context: ToolExecutionContext = {
        ...baseContext,
      };

      const result = await timeTool.execute({ timezone: 'Invalid/NonExistent_Zone' }, context);
      expect(result.timezone).toBe('UTC');
      expect(result.utcOffset).toMatch(/UTC|GMT|\+00:00/);
    });

    it('validates schema arguments', () => {
      expect(() => timeTool.schema.parse({ timezone: 12345 })).toThrow();
    });
  });

  describe('2. CoinFlipTool (games.coinflip)', () => {
    it('flips coin deterministically with mock RNG', async () => {
      // Mock RNG returning < 0.5 -> heads
      const headsTool = new CoinFlipTool(() => 0.2);
      const headsResult = await headsTool.execute({ call: 'heads' }, baseContext);
      expect(headsResult.result).toBe('heads');
      expect(headsResult.won).toBe(true);
      expect(headsResult.message).toContain('correctly');

      // Mock RNG returning >= 0.5 -> tails
      const tailsTool = new CoinFlipTool(() => 0.8);
      const tailsResult = await tailsTool.execute({ call: 'heads' }, baseContext);
      expect(tailsResult.result).toBe('tails');
      expect(tailsResult.won).toBe(false);
      expect(tailsResult.message).toContain('Better luck next time');
    });

    it('handles flips without a guess', async () => {
      const tool = new CoinFlipTool(() => 0.1);
      const result = await tool.execute({}, baseContext);
      expect(result.result).toBe('heads');
      expect(result.won).toBeUndefined();
    });
  });

  describe('3. AnimeSearchTool (anime.search)', () => {
    it('executes using custom search provider', async () => {
      const mockProvider = async (_title: string) => ({
        title: "Frieren: Beyond Journey's End",
        synopsis: 'An elf mage explores life after defeating the demon king.',
        score: 9.3,
        episodes: 28,
        status: 'FINISHED',
      });

      const tool = new AnimeSearchTool(mockProvider);
      const result = await tool.execute({ title: 'Frieren' }, baseContext);

      expect(result.title).toBe("Frieren: Beyond Journey's End");
      expect(result.score).toBe(9.3);
      expect(result.episodes).toBe(28);
    });

    it('reports no match when the provider finds nothing', async () => {
      const tool = new AnimeSearchTool(async () => null);
      const result = await tool.execute({ title: 'Nope' }, baseContext);
      expect(result).toEqual({ title: 'Nope', synopsis: 'No anime matching "Nope" was found.' });
    });

    it('reports the source as unreachable when the provider throws', async () => {
      const tool = new AnimeSearchTool(async () => {
        throw new Error('HTTP 503');
      });
      const result = await tool.execute({ title: 'Frieren' }, baseContext);
      expect(result.synopsis).toMatch(/unreachable/);
    });

    it('makes no network call without a provider', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await new AnimeSearchTool().execute({ title: 'Frieren' }, baseContext);
      expect(result.synopsis).toBe('Anime search is not available right now.');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('validates required non-empty title argument', () => {
      const tool = new AnimeSearchTool();
      expect(() => tool.schema.parse({ title: '' })).toThrow();
      expect(() => tool.schema.parse({})).toThrow();
    });
  });

  describe('4. ReminderTool (reminders.create)', () => {
    it('schedules through the injected scheduler and reports a Discord timestamp', async () => {
      const scheduler = vi.fn(async () => ({
        message: 'Check laundry',
        triggerAt: new Date('2026-09-22T12:15:00Z'),
      }));
      const tool = new ReminderTool(scheduler);

      const result = await tool.execute(
        { timeString: '15m', message: 'Check laundry' },
        baseContext,
      );

      expect(scheduler).toHaveBeenCalledWith(
        { timeString: '15m', message: 'Check laundry' },
        baseContext,
      );
      expect(result).toEqual({
        scheduled: true,
        message: 'Check laundry',
        triggerTimeIso: '2026-09-22T12:15:00.000Z',
        relativeDescription: '<t:1790079300:R>, <t:1790079300:f>',
      });
    });

    it('reports the user-facing reason when scheduling fails', async () => {
      const tool = new ReminderTool(async () => {
        throw Object.assign(new Error('past'), { userMessage: 'That time is in the past.' });
      });
      const result = await tool.execute({ timeString: 'yesterday', message: 'x' }, baseContext);
      expect(result).toMatchObject({ scheduled: false, error: 'That time is in the past.' });
    });

    it('never claims success without a scheduler', async () => {
      const result = await new ReminderTool().execute(
        { timeString: '15m', message: 'x' },
        baseContext,
      );
      expect(result.scheduled).toBe(false);
    });

    it('validates schema requirements', () => {
      const reminderTool = new ReminderTool();
      expect(() => reminderTool.schema.parse({ timeString: '' })).toThrow();
      expect(() => reminderTool.schema.parse({ timeString: '10m', message: '' })).toThrow();
    });
  });

  describe('5. MusicPlayTool (music.play)', () => {
    const musicTool = new MusicPlayTool();

    it('prepares playback request within a guild context', async () => {
      const result = await musicTool.execute({ query: 'YOASOBI Idol' }, baseContext);
      expect(result.action).toBe('queued');
      expect(result.query).toBe('YOASOBI Idol');
      expect(result.message).toContain('Searching and queuing');
    });

    it('rejects execution in DM context without guildId', async () => {
      const dmContext: ToolExecutionContext = { userId: 'user-1' };
      const result = await musicTool.execute({ query: 'Test' }, dmContext);
      expect(result.action).toBe('error');
      expect(result.message).toContain('only available in Discord servers');
    });

    it('resolves live playback via context.playMusic when provided', async () => {
      const liveContext: ToolExecutionContext = {
        ...baseContext,
        playMusic: async (query: string) => ({
          success: true,
          message: `Queued "${query}" in voice channel!`,
          trackTitle: 'Frieren OP - Yuusha',
          trackUrl: 'https://youtube.com/watch?v=mock',
          position: 1,
        }),
      };
      const result = await musicTool.execute({ query: 'Frieren opening' }, liveContext);
      expect(result.action).toBe('queued');
      expect(result.trackTitle).toBe('Frieren OP - Yuusha');
      expect(result.trackUrl).toBe('https://youtube.com/watch?v=mock');
      expect(result.position).toBe(1);
    });

    it('reports error when context.playMusic indicates not in voice channel', async () => {
      const errorContext: ToolExecutionContext = {
        ...baseContext,
        playMusic: async (_query: string) => ({
          success: false,
          message: 'You need to be connected to a voice channel first!',
        }),
      };
      const result = await musicTool.execute({ query: 'Frieren opening' }, errorContext);
      expect(result.action).toBe('error');
      expect(result.message).toContain('connected to a voice channel');
    });

    it('resolves playback via constructor playResolver fallback', async () => {
      const customMusicTool = new MusicPlayTool(async (query) => ({
        success: true,
        message: `Playing ${query} now!`,
        trackTitle: 'Special Track',
      }));
      const result = await customMusicTool.execute({ query: 'My Song' }, baseContext);
      expect(result.action).toBe('queued');
      expect(result.trackTitle).toBe('Special Track');
    });
  });

  describe('6. EconomyBalanceTool (economy.check_balance)', () => {
    const economyTool = new EconomyBalanceTool();

    it('defaults to context user ID when no target user specified', async () => {
      const result = await economyTool.execute({}, baseContext);
      expect(result.targetUserId).toBe('user-123');
      expect(result.wallet).toBe(0);
    });

    it('uses target user ID when explicitly provided', async () => {
      const result = await economyTool.execute({ targetUserId: 'target-999' }, baseContext);
      expect(result.targetUserId).toBe('target-999');
    });

    it('resolves balance from context.getBalance when provided', async () => {
      const customContext: ToolExecutionContext = {
        ...baseContext,
        getBalance: async (_id: string) => ({
          wallet: 250,
          bank: 50,
          netWorth: 300,
        }),
      };
      const result = await economyTool.execute({}, customContext);
      expect(result.wallet).toBe(250);
      expect(result.bank).toBe(50);
      expect(result.netWorth).toBe(300);
      expect(result.message).toContain('250 credits in wallet');
    });

    it('resolves balance from constructor balanceResolver fallback', async () => {
      const customTool = new EconomyBalanceTool(async (_id: string) => ({
        wallet: 1500,
        bank: 5000,
        netWorth: 6500,
      }));
      const result = await customTool.execute({ targetUserId: 'user-vip' }, baseContext);
      expect(result.wallet).toBe(1500);
      expect(result.bank).toBe(5000);
      expect(result.netWorth).toBe(6500);
      expect(result.message).toContain('1,500 credits in wallet');
    });
  });

  describe('7. ToolRegistry', () => {
    it('creates default registry populated with all 6 safe allowlist tools', () => {
      const registry = ToolRegistry.createDefault();
      expect(registry.has('get_current_time')).toBe(true);
      expect(registry.has('games.coinflip')).toBe(true);
      expect(registry.has('anime.search')).toBe(true);
      expect(registry.has('reminders.create')).toBe(true);
      expect(registry.has('music.play')).toBe(true);
      expect(registry.has('economy.check_balance')).toBe(true);
      expect(registry.getAll()).toHaveLength(6);
    });

    it('extracts definitions for LLM schemas with optional name filtering', () => {
      const registry = ToolRegistry.createDefault();
      const allDefs = registry.getDefinitions();
      expect(allDefs).toHaveLength(6);

      const filteredDefs = registry.getDefinitions(['get_current_time', 'games.coinflip']);
      expect(filteredDefs).toHaveLength(2);
      expect(filteredDefs[0]?.name).toBe('get_current_time');
      expect(filteredDefs[1]?.name).toBe('games.coinflip');
    });

    it('validates and executes tool call end-to-end', async () => {
      const registry = ToolRegistry.createDefault();
      const result = await registry.execute<{ timezone: string }>(
        'get_current_time',
        { timezone: 'UTC' },
        baseContext,
      );

      expect(result.timezone).toBe('UTC');
    });

    it('throws error when tool is not registered', async () => {
      const registry = ToolRegistry.createDefault();
      await expect(registry.execute('unregistered.tool', {}, baseContext)).rejects.toThrow(
        'Tool "unregistered.tool" is not registered',
      );
    });
  });
});
