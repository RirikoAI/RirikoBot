import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient, EconomyRepository, type SqliteDatabaseClient } from '@ririko/database';
import { EventBus } from '@ririko/core';
import { VoiceSessionAccumulator } from './voice-accumulator.js';
import { EconomyService } from './economy.service.js';
import { EconomyEventType } from './types.js';

describe('VoiceSessionAccumulator Anti-AFK Engine', () => {
  let accumulator: VoiceSessionAccumulator;
  const t0 = 1_000_000_000; // Reference timestamp in ms

  beforeEach(() => {
    accumulator = new VoiceSessionAccumulator({
      config: {
        minQuorum: 2,
        intervalSeconds: 60,
      },
      initialTime: t0,
    });
  });

  describe('Quorum Verification (Minimum 2 Unmuted Humans)', () => {
    it('does not award XP if only 1 human is present in channel (quorum failure)', async () => {
      accumulator.onVoiceStateUpdate({
        userId: 'human_1',
        guildId: 'guild_1',
        channelId: 'vc_general',
      });

      // 60 seconds elapse
      const result = await accumulator.tick(t0 + 60_000);

      expect(result.evaluatedChannels).toBe(1);
      expect(result.activeParticipants).toBe(1);
      expect(result.eligibleParticipants).toBe(0);
      expect(result.awardedEvents).toHaveLength(0);
      expect(accumulator.getAccruedSeconds('human_1')).toBe(0);
    });

    it('awards XP to both participants when quorum (>= 2 humans) is satisfied', async () => {
      accumulator.onVoiceStateUpdate({
        userId: 'human_1',
        guildId: 'guild_1',
        channelId: 'vc_general',
      });
      accumulator.onVoiceStateUpdate({
        userId: 'human_2',
        guildId: 'guild_1',
        channelId: 'vc_general',
      });

      // 60 seconds elapse
      const result = await accumulator.tick(t0 + 60_000);

      expect(result.eligibleParticipants).toBe(2);
      expect(result.awardedEvents).toHaveLength(2);
      expect(result.awardedEvents.map((e) => e.userId)).toEqual(['human_1', 'human_2']);
      expect(result.awardedEvents[0]!.type).toBe(EconomyEventType.VOICE_MINUTE);
      expect(result.awardedEvents[0]!.metadata?.minutesEarned).toBe(1);
    });

    it('excludes bots from quorum calculations', async () => {
      accumulator.onVoiceStateUpdate({
        userId: 'human_1',
        guildId: 'guild_1',
        channelId: 'vc_general',
      });
      accumulator.onVoiceStateUpdate({
        userId: 'music_bot',
        guildId: 'guild_1',
        channelId: 'vc_general',
        isBot: true,
      });

      // Only 1 human + 1 bot -> quorum = 1 human, fails minQuorum of 2
      const result = await accumulator.tick(t0 + 60_000);

      expect(result.activeParticipants).toBe(2);
      expect(result.eligibleParticipants).toBe(0);
      expect(result.awardedEvents).toHaveLength(0);
    });
  });

  describe('Mute & Deafen Disqualifications', () => {
    it('disqualifies self-muted users from quorum and rewards', async () => {
      accumulator.onVoiceStateUpdate({
        userId: 'human_1',
        guildId: 'guild_1',
        channelId: 'vc_general',
      });
      accumulator.onVoiceStateUpdate({
        userId: 'human_2',
        guildId: 'guild_1',
        channelId: 'vc_general',
        isSelfMuted: true, // Muted member
      });

      const result = await accumulator.tick(t0 + 60_000);

      // Quorum not met because only 1 member is unmuted
      expect(result.eligibleParticipants).toBe(0);
      expect(result.awardedEvents).toHaveLength(0);
    });

    it('disqualifies self-deafened users from quorum and rewards', async () => {
      accumulator.onVoiceStateUpdate({
        userId: 'human_1',
        guildId: 'guild_1',
        channelId: 'vc_general',
      });
      accumulator.onVoiceStateUpdate({
        userId: 'human_2',
        guildId: 'guild_1',
        channelId: 'vc_general',
        isSelfDeafened: true, // Deafened member
      });

      const result = await accumulator.tick(t0 + 60_000);
      expect(result.eligibleParticipants).toBe(0);
      expect(result.awardedEvents).toHaveLength(0);
    });

    it('disqualifies server-muted and server-deafened users', async () => {
      accumulator.onVoiceStateUpdate({
        userId: 'human_1',
        guildId: 'guild_1',
        channelId: 'vc_general',
      });
      accumulator.onVoiceStateUpdate({
        userId: 'human_2',
        guildId: 'guild_1',
        channelId: 'vc_general',
        isServerMuted: true,
      });

      const r1 = await accumulator.tick(t0 + 60_000);
      expect(r1.eligibleParticipants).toBe(0);

      // Unmute human_2, add human_3 who is server deafened
      accumulator.onVoiceStateUpdate({
        userId: 'human_2',
        guildId: 'guild_1',
        channelId: 'vc_general',
        isServerMuted: false,
      });
      accumulator.onVoiceStateUpdate({
        userId: 'human_3',
        guildId: 'guild_1',
        channelId: 'vc_general',
        isServerDeafened: true,
      });

      // human_1 and human_2 are active, human_3 is server deafened -> quorum of 2 is met!
      const r2 = await accumulator.tick(t0 + 120_000);
      expect(r2.eligibleParticipants).toBe(2);
      expect(r2.awardedEvents.map((e) => e.userId)).toEqual(['human_1', 'human_2']);
    });
  });

  describe('AFK Channel Exclusions', () => {
    it('hard-excludes designated AFK channels even with quorum present', async () => {
      accumulator.setAfkChannel('vc_afk_sleeping', true);

      accumulator.onVoiceStateUpdate({
        userId: 'human_1',
        guildId: 'guild_1',
        channelId: 'vc_afk_sleeping',
      });
      accumulator.onVoiceStateUpdate({
        userId: 'human_2',
        guildId: 'guild_1',
        channelId: 'vc_afk_sleeping',
      });
      accumulator.onVoiceStateUpdate({
        userId: 'human_3',
        guildId: 'guild_1',
        channelId: 'vc_afk_sleeping',
      });

      const result = await accumulator.tick(t0 + 60_000);

      // Entire channel excluded
      expect(result.eligibleParticipants).toBe(0);
      expect(result.awardedEvents).toHaveLength(0);
    });
  });

  describe('Discrete Accrual & Remainder Math', () => {
    it('accrues discrete 60-second buckets and retains remaining seconds', async () => {
      accumulator.onVoiceStateUpdate({
        userId: 'human_1',
        guildId: 'guild_1',
        channelId: 'vc_game',
      });
      accumulator.onVoiceStateUpdate({
        userId: 'human_2',
        guildId: 'guild_1',
        channelId: 'vc_game',
      });

      // First tick: 35 seconds elapsed
      const r1 = await accumulator.tick(t0 + 35_000);
      expect(r1.awardedEvents).toHaveLength(0);
      expect(accumulator.getAccruedSeconds('human_1')).toBe(35);

      // Second tick: another 35 seconds elapsed (total 70s)
      const r2 = await accumulator.tick(t0 + 70_000);
      expect(r2.awardedEvents).toHaveLength(2);
      expect(r2.awardedEvents[0]!.metadata?.minutesEarned).toBe(1);
      // Remainder 10 seconds preserved
      expect(accumulator.getAccruedSeconds('human_1')).toBe(10);
    });

    it('awards multiple minutes when large delta occurs', async () => {
      accumulator.onVoiceStateUpdate({
        userId: 'human_1',
        guildId: 'guild_1',
        channelId: 'vc_game',
      });
      accumulator.onVoiceStateUpdate({
        userId: 'human_2',
        guildId: 'guild_1',
        channelId: 'vc_game',
      });

      // 185 seconds elapsed
      const r = await accumulator.tick(t0 + 185_000);
      expect(r.awardedEvents).toHaveLength(2);
      expect(r.awardedEvents[0]!.metadata?.minutesEarned).toBe(3);
      expect(accumulator.getAccruedSeconds('human_1')).toBe(5);
    });
  });

  describe('Channel Switching & Leaves', () => {
    it('migrates user cleanly when moving channels and cleans up empty channels', async () => {
      accumulator.onVoiceStateUpdate({
        userId: 'user_a',
        guildId: 'guild_1',
        channelId: 'vc_room_1',
      });

      // User moves to room 2
      accumulator.onVoiceStateUpdate(
        {
          userId: 'user_a',
          guildId: 'guild_1',
          channelId: 'vc_room_2',
        },
        'vc_room_1',
      );

      expect(accumulator.getParticipant('user_a')?.channelId).toBe('vc_room_2');

      // User leaves
      accumulator.handleUserLeave('user_a');
      expect(accumulator.getParticipant('user_a')).toBeUndefined();
      expect(accumulator.getAccruedSeconds('user_a')).toBe(0);
    });
  });

  describe('Direct EconomyService Integration', () => {
    let client: SqliteDatabaseClient;
    let repo: EconomyRepository;
    let ecoService: EconomyService;
    let integratedAccumulator: VoiceSessionAccumulator;

    beforeEach(async () => {
      const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
      if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
      client = rawClient;

      client.raw.exec(`
        CREATE TABLE IF NOT EXISTS economy_balances (
          user_id TEXT PRIMARY KEY,
          wallet_balance INTEGER NOT NULL DEFAULT 0,
          bank_balance INTEGER NOT NULL DEFAULT 0,
          bank_capacity INTEGER NOT NULL DEFAULT 10000,
          net_worth INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS economy_transactions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          guild_id TEXT,
          type TEXT NOT NULL,
          amount INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'CREDITS',
          balance_before INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          source TEXT NOT NULL,
          metadata TEXT DEFAULT '{}',
          created_at INTEGER NOT NULL
        );
      `);

      repo = new EconomyRepository(client);
      ecoService = new EconomyService({ repository: repo, eventBus: new EventBus() });

      integratedAccumulator = new VoiceSessionAccumulator({
        economyService: ecoService,
        config: { minQuorum: 2, intervalSeconds: 60 },
        initialTime: t0,
      });
    });

    afterEach(async () => {
      await client.close();
    });

    it('automatically credits balances when integrated with EconomyService', async () => {
      integratedAccumulator.onVoiceStateUpdate({
        userId: 'voice_earner_1',
        guildId: 'guild_1',
        channelId: 'vc_chat',
      });
      integratedAccumulator.onVoiceStateUpdate({
        userId: 'voice_earner_2',
        guildId: 'guild_1',
        channelId: 'vc_chat',
      });

      const tickResult = await integratedAccumulator.tick(t0 + 60_000);

      expect(tickResult.awardedEvents).toHaveLength(2);
      expect(tickResult.rewardResults).toHaveLength(2);
      expect(tickResult.rewardResults![0]!.awarded).toBe(true);
      expect(tickResult.rewardResults![0]!.credits).toBe(35); // Default VOICE_MINUTE reward
      expect(tickResult.rewardResults![0]!.xp).toBe(40);

      // Verify balance in database
      const balance = await repo.findById('voice_earner_1');
      expect(balance?.walletBalance).toBe(35);
      expect(balance?.netWorth).toBe(35);
    });
  });
});
