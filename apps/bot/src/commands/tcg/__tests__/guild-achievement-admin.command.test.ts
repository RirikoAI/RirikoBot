import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGuildCommand } from '../guild.command.js';
import { createAchievementCommand } from '../achievement.command.js';
import { createTcgAdminCommand } from '../admin.command.js';
import type { BotServices } from '../../../services.js';
import type { CommandContext } from '@ririko/discord';

describe('TASK-1052: Guild, Achievement & TCG Admin Command Suites', () => {
  let services: BotServices;
  let replyMock: any;

  beforeEach(() => {
    replyMock = vi.fn().mockResolvedValue(undefined);

    const mockWaifuGuildService: any = {
      createGuild: vi.fn().mockResolvedValue({
        id: 'guild_123',
        name: 'Starlight Order',
        leaderUserId: 'user_1',
        level: 1,
        guildXp: 0,
        guildBank: 0,
        createdAt: new Date(),
      }),
      joinGuild: vi.fn().mockResolvedValue({
        guildId: 'guild_123',
        userId: 'user_2',
        rank: 'MEMBER',
        contributionXp: 0,
        joinedAt: new Date(),
      }),
      leaveGuild: vi.fn().mockResolvedValue({
        guildName: 'Starlight Order',
        disbanded: false,
      }),
      depositCredits: vi.fn().mockResolvedValue({
        newGuildBank: 1500,
        remainingWallet: 3500,
      }),
      getGuildDetails: vi.fn().mockResolvedValue({
        guild: {
          id: 'guild_123',
          name: 'Starlight Order',
          leaderUserId: 'user_1',
          level: 1,
          guildXp: 200,
          guildBank: 1500,
          createdAt: new Date(),
        },
        members: [
          {
            guildId: 'guild_123',
            userId: 'user_1',
            rank: 'LEADER',
            contributionXp: 500,
            joinedAt: new Date(),
          },
        ],
        memberCount: 1,
        maxMembers: 12,
        xpToNextLevel: 1000,
      }),
      getUserGuildDetails: vi.fn().mockResolvedValue({
        guild: {
          id: 'guild_123',
          name: 'Starlight Order',
          leaderUserId: 'user_1',
          level: 1,
          guildXp: 200,
          guildBank: 1500,
          createdAt: new Date(),
        },
        members: [
          {
            guildId: 'guild_123',
            userId: 'user_1',
            rank: 'LEADER',
            contributionXp: 500,
            joinedAt: new Date(),
          },
        ],
        memberCount: 1,
        maxMembers: 12,
        xpToNextLevel: 1000,
      }),
      getLeaderboard: vi.fn().mockResolvedValue([
        {
          id: 'guild_123',
          name: 'Starlight Order',
          leaderUserId: 'user_1',
          level: 2,
          guildXp: 500,
          guildBank: 5000,
          createdAt: new Date(),
        },
      ]),
    };

    const mockAchievementService: any = {
      getUserAchievements: vi.fn().mockResolvedValue([
        {
          id: 'uach_1',
          userId: 'user_1',
          achievementId: 'ach_1',
          progress: 10,
          isUnlocked: true,
          isClaimed: false,
          achievement: {
            id: 'ach_1',
            code: 'COLL_INITIATE',
            title: 'Card Initiate',
            description: 'Collect 10 cards',
            category: 'COLLECTOR',
            tier: 'BRONZE',
            requirementTarget: 10,
          },
        },
      ]),
      claimAchievement: vi.fn().mockResolvedValue({
        achievement: {
          id: 'ach_1',
          code: 'COLL_INITIATE',
          title: 'Card Initiate',
          description: 'Collect 10 cards',
          tier: 'BRONZE',
        },
        rewardsDispatched: {
          credits: 1000,
          exp: 500,
          cards: [],
          items: [],
          consumables: { potion_hp_minor: 2 },
          title: null,
          badge: null,
        },
        summary: 'Claimed Card Initiate',
      }),
      claimAll: vi.fn().mockResolvedValue([
        {
          achievement: {
            id: 'ach_1',
            code: 'COLL_INITIATE',
            title: 'Card Initiate',
            description: 'Collect 10 cards',
            tier: 'BRONZE',
          },
          rewardsDispatched: {
            credits: 1000,
            exp: 500,
            cards: [],
            items: [],
            consumables: { potion_hp_minor: 2 },
            title: null,
            badge: null,
          },
          summary: 'Claimed Card Initiate',
        },
      ]),
    };

    const mockTcgConfigService: any = {
      isAuthorized: vi.fn().mockResolvedValue(true),
      getConfig: vi.fn().mockResolvedValue(300),
      setConfig: vi.fn().mockResolvedValue(350),
      getAllConfigs: vi.fn().mockResolvedValue({
        global_max_energy_cap: 300,
        base_energy_capacity: 100,
        energy_scaling_per_level: 2,
        daily_energy_restore_pot_limit: 3,
        daily_replenish_cron: '0 0 * * *',
        max_bonus_energy_cap: 50,
        daily_bonus_energy_increment: 5,
        dungeon_scaling_model: 'HYBRID',
        dungeon_growth_rate: 0.085,
        market_tax_rate: 0.05,
        tcg_manager_role_id: '',
      }),
    };

    services = {
      waifuGuildService: mockWaifuGuildService,
      achievementService: mockAchievementService,
      tcgConfigService: mockTcgConfigService,
    } as unknown as BotServices;
  });

  const createMockContext = (
    options: Record<string, any> = {},
    args: string[] = [],
    isPrefix = false,
  ): CommandContext =>
    ({
      source: isPrefix ? 'prefix' : 'slash',
      id: 'interaction_123',
      guildId: 'guild_discord',
      channelId: 'channel_1',
      user: { id: 'user_1', username: 'TestUser' } as any,
      member: {
        roles: ['role_admin'],
        permissions: { has: vi.fn().mockReturnValue(true) },
      } as any,
      guild: { id: 'guild_discord' } as any,
      channel: { id: 'channel_1' } as any,
      client: {} as any,
      options: {
        getString: vi.fn((key: string) => options[key] ?? null),
        getInteger: vi.fn((key: string) => options[key] ?? null),
        getNumber: vi.fn((key: string) => options[key] ?? null),
        getBoolean: vi.fn((key: string) => options[key] ?? null),
        getUser: vi.fn().mockResolvedValue(options['user'] ?? null),
        getMember: vi.fn().mockResolvedValue(null),
        getChannel: vi.fn().mockResolvedValue(null),
        getAttachment: vi.fn().mockReturnValue(null),
        getRawArgs: vi.fn().mockReturnValue(args),
      },
      reply: replyMock,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
    }) as unknown as CommandContext;

  describe('WaifuGuild Command', () => {
    it('creates a new guild', async () => {
      const cmd = createGuildCommand(services);
      const ctx = createMockContext({
        action: 'create',
        name: 'Starlight Order',
      });

      await cmd.execute(ctx);
      expect(services.waifuGuildService.createGuild).toHaveBeenCalledWith({
        name: 'Starlight Order',
        leaderUserId: 'user_1',
      });
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('joins a guild', async () => {
      const cmd = createGuildCommand(services);
      const ctx = createMockContext({
        action: 'join',
        name: 'Starlight Order',
      });

      await cmd.execute(ctx);
      expect(services.waifuGuildService.joinGuild).toHaveBeenCalledWith(
        'user_1',
        'Starlight Order',
      );
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('deposits credits to guild bank', async () => {
      const cmd = createGuildCommand(services);
      const ctx = createMockContext({
        action: 'deposit',
        amount: 1000,
      });

      await cmd.execute(ctx);
      expect(services.waifuGuildService.depositCredits).toHaveBeenCalledWith('user_1', 1000);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('views guild leaderboard', async () => {
      const cmd = createGuildCommand(services);
      const ctx = createMockContext({
        action: 'leaderboard',
      });

      await cmd.execute(ctx);
      expect(services.waifuGuildService.getLeaderboard).toHaveBeenCalledWith(10, 0);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });
  });

  describe('Achievement Command', () => {
    it('lists user achievements', async () => {
      const cmd = createAchievementCommand(services);
      const ctx = createMockContext({
        action: 'list',
      });

      await cmd.execute(ctx);
      expect(services.achievementService.getUserAchievements).toHaveBeenCalledWith('user_1');
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('claims an achievement by code', async () => {
      const cmd = createAchievementCommand(services);
      const ctx = createMockContext({
        action: 'claim',
        code: 'COLL_INITIATE',
      });

      await cmd.execute(ctx);
      expect(services.achievementService.claimAchievement).toHaveBeenCalledWith(
        'user_1',
        'COLL_INITIATE',
      );
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('claims all achievements', async () => {
      const cmd = createAchievementCommand(services);
      const ctx = createMockContext({
        action: 'claim',
        code: 'all',
      });

      await cmd.execute(ctx);
      expect(services.achievementService.claimAll).toHaveBeenCalledWith('user_1');
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });
  });

  describe('TCG Admin Command', () => {
    it('rejects unauthorized users', async () => {
      (services.tcgConfigService.isAuthorized as any).mockResolvedValueOnce(false);
      const cmd = createTcgAdminCommand(services);
      const ctx = createMockContext({
        action: 'energy',
        max_cap: 400,
      });

      await cmd.execute(ctx);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Access Denied'),
          ephemeral: true,
        }),
      );
    });

    it('updates energy parameters when authorized', async () => {
      const cmd = createTcgAdminCommand(services);
      const ctx = createMockContext({
        action: 'energy',
        max_cap: 400,
        pot_limit: 5,
        bonus_cap: 75,
        bonus_increment: 10,
      });

      await cmd.execute(ctx);
      expect(services.tcgConfigService.setConfig).toHaveBeenCalledWith(
        'global_max_energy_cap',
        400,
        'user_1',
      );
      expect(services.tcgConfigService.setConfig).toHaveBeenCalledWith(
        'daily_energy_restore_pot_limit',
        5,
        'user_1',
      );
      expect(services.tcgConfigService.setConfig).toHaveBeenCalledWith(
        'max_bonus_energy_cap',
        75,
        'user_1',
      );
      expect(services.tcgConfigService.setConfig).toHaveBeenCalledWith(
        'daily_bonus_energy_increment',
        10,
        'user_1',
      );
    });

    it('updates energy parameters via prefix arguments', async () => {
      const cmd = createTcgAdminCommand(services);
      const ctx = createMockContext({}, ['energy', 'bonus_cap:100', 'bonus_increment:15']);

      await cmd.execute(ctx);
      expect(services.tcgConfigService.setConfig).toHaveBeenCalledWith(
        'max_bonus_energy_cap',
        100,
        'user_1',
      );
      expect(services.tcgConfigService.setConfig).toHaveBeenCalledWith(
        'daily_bonus_energy_increment',
        15,
        'user_1',
      );
    });

    it('views global configurations', async () => {
      const cmd = createTcgAdminCommand(services);
      const ctx = createMockContext({
        action: 'view',
      });

      await cmd.execute(ctx);
      expect(services.tcgConfigService.getAllConfigs).toHaveBeenCalled();
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });
  });
});
