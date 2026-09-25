import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus, type CoreEvents } from '@ririko/core';
import { AntiRaidService } from './anti-raid.service.js';

describe('AntiRaidService Suite', () => {
  let service: AntiRaidService;
  let eventBus: EventBus<CoreEvents>;

  beforeEach(() => {
    eventBus = new EventBus<CoreEvents>();
    service = new AntiRaidService(undefined, undefined, eventBus);
  });

  it('should return isRaid: false for normal member joins', async () => {
    const now = 1000000;
    const result = await service.handleMemberJoin({
      guildId: 'guild-1',
      userId: 'user-1',
      username: 'RegularUser',
      accountCreatedTimestamp: now - 30 * 24 * 60 * 60 * 1000, // 30 days old
      joinedTimestamp: now,
    });

    expect(result.isRaid).toBe(false);
    expect(result.status).toBe('NORMAL');
    expect(result.joinCount).toBe(1);
    expect(result.freshAccountCount).toBe(0);
  });

  it('should ignore bot joins', async () => {
    const now = 1000000;
    const result = await service.handleMemberJoin({
      guildId: 'guild-1',
      userId: 'bot-1',
      isBot: true,
      accountCreatedTimestamp: now - 10000,
      joinedTimestamp: now,
    });

    expect(result.isRaid).toBe(false);
    expect(result.joinCount).toBe(0);
  });

  it('should trigger raid lockdown when join velocity threshold is reached', async () => {
    const baseTime = 2000000;
    const guildId = 'guild-1';
    const listener = vi.fn();
    eventBus.on('moderation:raidDetected', listener);

    // Default joinThreshold is 10 within 10s
    let lastResult;
    for (let i = 0; i < 10; i++) {
      lastResult = await service.handleMemberJoin({
        guildId,
        userId: `raider-${i}`,
        username: `Raider_${i}`,
        accountCreatedTimestamp: baseTime - 48 * 3600 * 1000, // 48h old (not fresh)
        joinedTimestamp: baseTime + i * 500, // joins spaced every 500ms
      });
    }

    expect(lastResult?.isRaid).toBe(true);
    expect(lastResult?.status).toBe('LOCKDOWN');
    expect(lastResult?.joinCount).toBe(10);
    expect(lastResult?.actionTaken).toBe('LOCKDOWN');
    expect(lastResult?.lockdownExpiresAt).toBeDefined();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId,
        joinCount: 10,
        actionTaken: 'LOCKDOWN',
      }),
    );
  });

  it('should trigger on fresh account cluster even if under total velocity threshold', async () => {
    const baseTime = 3000000;
    const guildId = 'guild-1';

    // Default freshAccountThreshold is 5 fresh accounts (<24h old)
    let result;
    for (let i = 0; i < 5; i++) {
      result = await service.handleMemberJoin({
        guildId,
        userId: `fresh-bot-${i}`,
        username: `FreshBot_${i}`,
        accountCreatedTimestamp: baseTime - 2 * 3600 * 1000, // only 2 hours old!
        joinedTimestamp: baseTime + i * 300,
      });
    }

    expect(result?.isRaid).toBe(true);
    expect(result?.freshAccountCount).toBe(5);
    expect(result?.reason).toContain('fresh accounts');
  });

  it('should respect custom guild configuration', async () => {
    const guildId = 'small-guild';
    service.setConfig(guildId, {
      joinThreshold: 3,
      windowSeconds: 5,
      action: 'ALERT_ONLY',
    });

    const baseTime = 4000000;
    for (let i = 0; i < 2; i++) {
      await service.handleMemberJoin({
        guildId,
        userId: `user-${i}`,
        accountCreatedTimestamp: baseTime - 10000000,
        joinedTimestamp: baseTime + i * 500,
      });
    }

    const third = await service.handleMemberJoin({
      guildId,
      userId: 'user-3',
      accountCreatedTimestamp: baseTime - 10000000,
      joinedTimestamp: baseTime + 1500,
    });

    expect(third.isRaid).toBe(true);
    expect(third.status).toBe('RAID_DETECTED');
    expect(third.actionTaken).toBe('ALERT_ONLY');
    expect(third.lockdownExpiresAt).toBeUndefined();
  });

  it('should auto-recover once lockdown expiration timestamp passes', async () => {
    const guildId = 'guild-1';
    const baseTime = 5000000;

    service.setConfig(guildId, {
      joinThreshold: 2,
      cooldownMinutes: 5,
    });

    await service.handleMemberJoin({
      guildId,
      userId: 'u1',
      accountCreatedTimestamp: baseTime - 500000,
      joinedTimestamp: baseTime,
    });

    const raidResult = await service.handleMemberJoin({
      guildId,
      userId: 'u2',
      accountCreatedTimestamp: baseTime - 500000,
      joinedTimestamp: baseTime + 100,
    });

    expect(raidResult.status).toBe('LOCKDOWN');

    // Simulate time advancing past lockdown duration (5m = 300,000ms)
    const futureTime = baseTime + 6 * 60 * 1000;
    vi.setSystemTime(futureTime);

    const state = service.getState(guildId);
    expect(state.status).toBe('NORMAL');

    vi.useRealTimers();
  });

  it('should manually resolve raid on resolveRaid()', async () => {
    const guildId = 'guild-1';
    service.setConfig(guildId, { joinThreshold: 2 });
    const now = Date.now();

    for (let i = 0; i < 2; i++) {
      await service.handleMemberJoin({
        guildId,
        userId: `user-${i}`,
        accountCreatedTimestamp: now - 3600000,
        joinedTimestamp: now + i * 10,
      });
    }

    expect(service.getState(guildId).status).toBe('LOCKDOWN');

    service.resolveRaid(guildId);
    expect(service.getState(guildId).status).toBe('NORMAL');
  });

  it('should generate formatted alert embed data', async () => {
    const result = {
      isRaid: true,
      guildId: 'guild-1',
      status: 'LOCKDOWN' as const,
      joinCount: 12,
      freshAccountCount: 7,
      actionTaken: 'LOCKDOWN' as const,
      reason: 'Mass join detected',
      accounts: [
        {
          userId: 'acc-1',
          username: 'FreshSpammer1',
          joinedAt: 1000,
          accountAgeHours: 1.5,
          isFreshAccount: true,
        },
      ],
      lockdownExpiresAt: Date.now() + 600000,
    };

    const embed = service.generateAlertEmbed(result);
    expect(embed.title).toContain('Anti-Raid Alert');
    expect(embed.color).toBe(0xff0033);
    expect(embed.fields).toHaveLength(5);
    expect(embed.fields.find((f) => f.name.includes('Suspicious Fresh Accounts'))?.value).toBe('7');
    expect(embed.fields.find((f) => f.name === 'Status')?.value).toContain(
      'Server Lockdown Active',
    );
  });
});
