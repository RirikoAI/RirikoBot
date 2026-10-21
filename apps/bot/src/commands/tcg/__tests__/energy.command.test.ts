import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CommandContext } from '@ririko/discord';
import { CommandCategory } from '@ririko/discord';
import { createEnergyCommand } from '../energy.command.js';
import type { BotServices } from '../../../services.js';

const NEXT_RESET = new Date('2026-10-22T16:00:00.000Z');
const NEXT_RESET_UNIX = Math.floor(NEXT_RESET.getTime() / 1000);

const RULES = {
  globalCap: 300,
  baseCapacity: 100,
  scalingPerLevel: 2,
  dailyPotionLimit: 3,
  maxBonusCap: 50,
  dailyBonusIncrement: 5,
};

describe('TASK-1971: /energy and !energy', () => {
  let replyMock: ReturnType<typeof vi.fn>;
  let energy: Record<string, unknown>;
  let rules: typeof RULES;
  let lifecycle: {
    getOrReconcileUserEnergy: ReturnType<typeof vi.fn>;
    rules: ReturnType<typeof vi.fn>;
    nextResetAt: ReturnType<typeof vi.fn>;
  };
  let services: BotServices;

  beforeEach(() => {
    replyMock = vi.fn().mockResolvedValue(undefined);
    energy = {
      userId: 'user_123',
      currentEnergy: 80,
      maxEnergy: 123,
      bonusEnergy: 15,
      dailyEnergyPotsUsed: 2,
      lastResetDate: '2026-10-21',
    };
    rules = { ...RULES };
    lifecycle = {
      getOrReconcileUserEnergy: vi.fn().mockImplementation(async () => energy),
      rules: vi.fn().mockImplementation(async () => rules),
      nextResetAt: vi.fn().mockReturnValue(NEXT_RESET),
    };
    services = { energyLifecycleService: lifecycle } as unknown as BotServices;
  });

  const createContext = (source: 'slash' | 'prefix', guild: unknown): CommandContext =>
    ({
      source,
      user: { id: 'user_123', username: 'TestHero' },
      guild,
      guildId: guild ? 'guild_123' : null,
      options: { getString: () => null, getRawArgs: () => [] },
      reply: replyMock,
    }) as unknown as CommandContext;

  const fields = (): Record<string, string> => {
    expect(replyMock).toHaveBeenCalledTimes(1);
    const payload = replyMock.mock.calls[0]![0];
    expect(payload.ephemeral).toBeUndefined();
    const data = payload.embeds[0].data;
    return Object.fromEntries(
      (data.fields as { name: string; value: string }[]).map((f) => [f.name, f.value]),
    );
  };

  it('is a global TCG command with the stamina alias and no options', () => {
    const { metadata } = createEnergyCommand(services);
    expect(metadata.name).toBe('energy');
    expect(metadata.category).toBe(CommandCategory.TCG);
    expect(metadata.aliases).toEqual(['stamina']);
    expect(metadata.options).toBeUndefined();
    expect(metadata.isGuildOnly).toBeUndefined();
    expect(metadata.registrationScope).toBeUndefined();
  });

  it('shows energy, level cap, bonus energy, potions and the next refill for a slash call', async () => {
    const cmd = createEnergyCommand(services);

    await cmd.execute(createContext('slash', { id: 'guild_123' }));

    expect(lifecycle.getOrReconcileUserEnergy).toHaveBeenCalledWith('user_123');
    const f = fields();
    expect(f['⚡ Energy']).toBe('`80/138`');
    expect(f['📈 Level cap']).toBe('`123`');
    expect(f['🔋 Bonus energy']).toBe('`15/50 (+5 at the next reset)`');
    expect(f['🧪 Potions today']).toBe('`2/3`');
    expect(f['⏰ Next refill']).toBe(`<t:${NEXT_RESET_UNIX}:R>`);
    const data = replyMock.mock.calls[0]![0].embeds[0].data;
    expect(data.footer.text).toContain('Energy refills at each daily reset');
  });

  it('answers the same for a prefix call', async () => {
    const cmd = createEnergyCommand(services);

    await cmd.execute(createContext('prefix', { id: 'guild_123' }));

    const f = fields();
    expect(f['⚡ Energy']).toBe('`80/138`');
    expect(f['🧪 Potions today']).toBe('`2/3`');
  });

  it('leaves out the next reset bonus when the player is at the bonus cap', async () => {
    energy.bonusEnergy = 50;
    const cmd = createEnergyCommand(services);

    await cmd.execute(createContext('slash', { id: 'guild_123' }));

    const f = fields();
    expect(f['🔋 Bonus energy']).toBe('`50/50`');
    expect(f['🔋 Bonus energy']).not.toContain('+5');
  });

  it('leaves out the next reset bonus when the daily increment is 0', async () => {
    rules.dailyBonusIncrement = 0;
    const cmd = createEnergyCommand(services);

    await cmd.execute(createContext('slash', { id: 'guild_123' }));

    expect(fields()['🔋 Bonus energy']).toBe('`15/50`');
  });

  it('works in a DM, without a guild', async () => {
    const cmd = createEnergyCommand(services);

    await cmd.execute(createContext('slash', null));

    const f = fields();
    expect(f['⚡ Energy']).toBe('`80/138`');
    expect(f['⏰ Next refill']).toBe(`<t:${NEXT_RESET_UNIX}:R>`);
  });
});
