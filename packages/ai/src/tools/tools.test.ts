import { describe, it, expect } from 'vitest';
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
        title: 'Frieren: Beyond Journey\'s End',
        synopsis: 'An elf mage explores life after defeating the demon king.',
        score: 9.3,
        episodes: 28,
        status: 'FINISHED',
      });

      const tool = new AnimeSearchTool(mockProvider);
      const result = await tool.execute({ title: 'Frieren' }, baseContext);

      expect(result.title).toBe('Frieren: Beyond Journey\'s End');
      expect(result.score).toBe(9.3);
      expect(result.episodes).toBe(28);
    });

    it('validates required non-empty title argument', () => {
      const tool = new AnimeSearchTool();
      expect(() => tool.schema.parse({ title: '' })).toThrow();
      expect(() => tool.schema.parse({})).toThrow();
    });
  });

  describe('4. ReminderTool (reminders.create)', () => {
    const reminderTool = new ReminderTool();

    it.each([
      ['10s', 10 * 1000, '10 seconds'],
      ['5m', 5 * 60 * 1000, '5 minutes'],
      ['2h', 2 * 3600 * 1000, '2 hours'],
      ['1d', 86400 * 1000, '1 day'],
    ])('parses duration %s into correct milliseconds (%i)', (input, expectedMs, expectedDesc) => {
      const parsed = reminderTool.parseDuration(input);
      expect(parsed.ms).toBe(expectedMs);
      expect(parsed.description).toBe(expectedDesc);
    });

    it('schedules reminder with accurate trigger timestamp', async () => {
      const before = Date.now();
      const result = await reminderTool.execute(
        { timeString: '15m', message: 'Check laundry' },
        baseContext,
      );

      expect(result.scheduled).toBe(true);
      expect(result.message).toBe('Check laundry');
      expect(result.relativeDescription).toBe('in 15 minutes');

      const triggerMs = new Date(result.triggerTimeIso).getTime();
      expect(triggerMs).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 50);
      expect(triggerMs).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000 + 50);
    });

    it('validates schema requirements', () => {
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
  });

  describe('6. EconomyBalanceTool (economy.check_balance)', () => {
    const economyTool = new EconomyBalanceTool();

    it('defaults to context user ID when no target user specified', async () => {
      const result = await economyTool.execute({}, baseContext);
      expect(result.targetUserId).toBe('user-123');
    });

    it('uses target user ID when explicitly provided', async () => {
      const result = await economyTool.execute({ targetUserId: 'target-999' }, baseContext);
      expect(result.targetUserId).toBe('target-999');
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
      await expect(
        registry.execute('unregistered.tool', {}, baseContext),
      ).rejects.toThrow('Tool "unregistered.tool" is not registered');
    });
  });
});
