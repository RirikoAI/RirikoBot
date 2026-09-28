import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGuildCommand } from '../guild.command.js';
import { createAchievementCommand } from '../achievement.command.js';
import { createTcgAdminCommand } from '../admin.command.js';
import type { BotServices } from '../../../services.js';
import type { CommandContext } from '@ririko/discord';
import { GuildConfigValidationError } from '@ririko/services';

describe('TASK-1052: Guild, Achievement & TCG Admin Command Suites', () => {
  let services: BotServices;
  let replyMock: any;
  let guildTcg: Record<string, unknown>;

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
      }),
    };

    guildTcg = {
      dropsEnabled: false,
      dropChannelId: null,
      dropMessageThreshold: 50,
      dropStartHour: 8,
      dropEndHour: 23,
      dropClaimTimeoutSeconds: 60,
      dropCooldownMinutes: 5,
      managerRoleId: null,
    };
    const mockGuildConfigService: any = {
      get: vi.fn(async () => guildTcg),
      update: vi.fn(async (_guildId: string, _module: string, patch: Record<string, unknown>) => ({
        values: { ...guildTcg, ...patch },
        changes: [{ field: 'x', before: null, after: null }],
      })),
    };

    services = {
      waifuGuildService: mockWaifuGuildService,
      achievementService: mockAchievementService,
      tcgConfigService: mockTcgConfigService,
      guildConfigService: mockGuildConfigService,
    } as unknown as BotServices;
  });

  const createMockContext = (
    options: Record<string, any> = {},
    args: string[] = [],
    isPrefix = false,
    isAdmin = true,
    roles: string[] = ['role_admin'],
  ): CommandContext =>
    ({
      source: isPrefix ? 'prefix' : 'slash',
      id: 'interaction_123',
      guildId: 'guild_discord',
      channelId: 'channel_1',
      user: { id: 'user_1', username: 'TestUser' } as any,
      member: {
        roles,
        permissions: { has: vi.fn().mockReturnValue(isAdmin) },
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
        getChannel: vi.fn().mockResolvedValue(options['channel'] ?? null),
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
      guildTcg.managerRoleId = 'role_tcg';
      const cmd = createTcgAdminCommand(services);
      const ctx = createMockContext({ action: 'energy', max_cap: 400 }, [], false, false, [
        'role_other',
      ]);

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

    it('refuses outside a server', async () => {
      const cmd = createTcgAdminCommand(services);
      const ctx = { ...createMockContext({ action: 'view' }), guildId: null } as CommandContext;
      await cmd.execute(ctx);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('only be used in a server') }),
      );
    });

    it('lets holders of the guild TCG Manager Role manage drops', async () => {
      guildTcg.managerRoleId = 'role_tcg';
      const cmd = createTcgAdminCommand(services);
      const ctx = createMockContext(
        {
          action: 'drops',
          enabled: true,
          channel: { id: '123456789012345678' },
          threshold: 30,
          start_hour: 20,
          end_hour: 20,
          claim_seconds: 90,
          cooldown_minutes: 2,
        },
        [],
        false,
        false,
        ['role_tcg'],
      );

      await cmd.execute(ctx);
      expect(services.guildConfigService.update).toHaveBeenCalledWith(
        'guild_discord',
        'tcg',
        {
          dropsEnabled: true,
          dropChannelId: '123456789012345678',
          dropMessageThreshold: 30,
          dropStartHour: 20,
          dropEndHour: 20,
          dropClaimTimeoutSeconds: 90,
          dropCooldownMinutes: 2,
        },
        { userId: 'user_1', source: 'discord' },
      );
      const embed = replyMock.mock.calls[0][0].embeds[0].toJSON();
      expect(embed.title).toBe('🃏 Card Drop Settings Updated');
      expect(embed.description).toContain('all day');
      expect(embed.description).toContain('<#123456789012345678>');
    });

    it('reads drop settings from prefix arguments', async () => {
      const cmd = createTcgAdminCommand(services);
      const ctx = createMockContext({}, [
        'drops',
        'enabled:on',
        'channel:<#123456789012345678>',
        'threshold:12',
        'unknown:1',
        'noseparator',
      ]);

      await cmd.execute(ctx);
      expect(services.guildConfigService.update).toHaveBeenCalledWith(
        'guild_discord',
        'tcg',
        { dropsEnabled: 'on', dropChannelId: '123456789012345678', dropMessageThreshold: '12' },
        { userId: 'user_1', source: 'discord' },
      );
    });

    it('explains the usage when no drop settings are given', async () => {
      const cmd = createTcgAdminCommand(services);
      await cmd.execute(createMockContext({ action: 'drops' }));
      expect(services.guildConfigService.update).not.toHaveBeenCalled();
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('No drop settings provided') }),
      );
    });

    it('shows validation errors for drop settings', async () => {
      (services.guildConfigService.update as any).mockRejectedValueOnce(
        new GuildConfigValidationError({ dropMessageThreshold: ['Enter a whole number.'] }),
      );
      const cmd = createTcgAdminCommand(services);
      await cmd.execute(createMockContext({ action: 'drops', threshold: 1 }));
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Enter a whole number.'),
          ephemeral: true,
        }),
      );
    });

    it('sets and clears the guild TCG Manager Role for server admins', async () => {
      const cmd = createTcgAdminCommand(services);
      await cmd.execute(createMockContext({ action: 'role', role: '<@&123456789012345678>' }));
      expect(services.guildConfigService.update).toHaveBeenCalledWith(
        'guild_discord',
        'tcg',
        { managerRoleId: '123456789012345678' },
        { userId: 'user_1', source: 'discord' },
      );
      expect(replyMock.mock.calls[0][0].embeds[0].toJSON().description).toContain(
        '<@&123456789012345678>',
      );

      (services.guildConfigService.update as any).mockResolvedValueOnce({
        values: { ...guildTcg, managerRoleId: null },
        changes: [],
      });
      await cmd.execute(createMockContext({}, ['role', 'none']));
      expect(replyMock.mock.calls[1][0].embeds[0].toJSON().description).toContain('removed');
    });

    it('asks for a role when none is given', async () => {
      const cmd = createTcgAdminCommand(services);
      await cmd.execute(createMockContext({ action: 'role' }));
      expect(services.guildConfigService.update).not.toHaveBeenCalled();
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Please specify a role') }),
      );
    });

    it('rejects an invalid manager role', async () => {
      (services.guildConfigService.update as any).mockRejectedValueOnce(
        new GuildConfigValidationError({ managerRoleId: ['Must be a Discord ID.'] }),
      );
      const cmd = createTcgAdminCommand(services);
      await cmd.execute(createMockContext({ action: 'role', role: 'abc' }));
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Must be a Discord ID.') }),
      );
    });

    it('does not let TCG Managers change the manager role', async () => {
      guildTcg.managerRoleId = 'role_tcg';
      const cmd = createTcgAdminCommand(services);
      await cmd.execute(
        createMockContext({ action: 'role', role: '123456789012345678' }, [], false, false, [
          'role_tcg',
        ]),
      );
      expect(services.guildConfigService.update).not.toHaveBeenCalled();
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Manage Server') }),
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
