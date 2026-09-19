import type {
  WaifuGuildRepository,
  EconomyRepository,
  DatabaseClient,
  WaifuGuild,
  WaifuGuildMember,
} from '@ririko/database';
import { withTransaction } from '@ririko/database';

export interface CreateGuildParams {
  name: string;
  leaderUserId: string;
}

export interface GuildDetails {
  guild: WaifuGuild;
  members: WaifuGuildMember[];
  memberCount: number;
  maxMembers: number;
  xpToNextLevel: number;
}

export class WaifuGuildService {
  public static readonly CREATION_FEE = 5000;

  constructor(
    private readonly guildRepo: WaifuGuildRepository,
    private readonly economyRepo: EconomyRepository,
    private readonly dbClient: DatabaseClient,
  ) {}

  /**
   * Calculates maximum member capacity for a guild based on its level:
   * Capacity = 10 + (level * 2)
   */
  calculateMaxMembers(level: number): number {
    return 10 + level * 2;
  }

  /**
   * Calculates XP required to reach the next guild level:
   * Required XP = floor(1000 * level^1.5)
   */
  calculateXpToNextLevel(level: number): number {
    return Math.floor(1000 * Math.pow(level, 1.5));
  }

  /**
   * Creates a new WaifuGuild, deducting the 5,000 Credits creation fee.
   */
  async createGuild(params: CreateGuildParams): Promise<WaifuGuild> {
    const { name, leaderUserId } = params;
    const trimmedName = name.trim();

    if (trimmedName.length < 3 || trimmedName.length > 32) {
      throw new Error('Guild name must be between 3 and 32 characters long.');
    }

    const existingGuild = await this.guildRepo.findByName(trimmedName);
    if (existingGuild) {
      throw new Error(`A WaifuGuild named "${trimmedName}" already exists.`);
    }

    const userGuild = await this.guildRepo.findUserGuild(leaderUserId);
    if (userGuild) {
      throw new Error('You are already a member of a WaifuGuild. Leave your current guild first.');
    }

    // Verify and deduct 5,000 credits
    const balance = await this.economyRepo.findById(leaderUserId);
    if (!balance || balance.walletBalance < WaifuGuildService.CREATION_FEE) {
      throw new Error(
        `Creating a WaifuGuild requires ${WaifuGuildService.CREATION_FEE.toLocaleString()} Credits. Your wallet balance is ${(balance?.walletBalance ?? 0).toLocaleString()} Credits.`,
      );
    }

    return withTransaction(this.dbClient, async (tx) => {
      // Deduct fee
      await this.economyRepo.modifyBalance(
        {
          userId: leaderUserId,
          walletDelta: -WaifuGuildService.CREATION_FEE,
          type: 'GUILD_CREATE_FEE',
          source: 'WAIFU_GUILD',
        },
        tx,
      );

      // Create guild
      const newGuild = await this.guildRepo.create(
        {
          name: trimmedName,
          leaderUserId,
          level: 1,
          guildXp: 0,
          guildBank: 0,
        },
        tx,
      );

      // Add leader as member
      await this.guildRepo.addMember(
        {
          guildId: newGuild.id,
          userId: leaderUserId,
          rank: 'LEADER',
        },
        tx,
      );

      return newGuild;
    });
  }

  /**
   * Joins an existing guild by name or ID.
   */
  async joinGuild(userId: string, guildNameOrId: string): Promise<WaifuGuildMember> {
    const userGuild = await this.guildRepo.findUserGuild(userId);
    if (userGuild) {
      throw new Error(`You are already a member of "${userGuild.guild.name}". Leave it first.`);
    }

    const guild =
      (await this.guildRepo.findById(guildNameOrId)) ??
      (await this.guildRepo.findByName(guildNameOrId));

    if (!guild) {
      throw new Error(`WaifuGuild "${guildNameOrId}" not found.`);
    }

    const memberCount = await this.guildRepo.countMembers(guild.id);
    const maxCapacity = this.calculateMaxMembers(guild.level);

    if (memberCount >= maxCapacity) {
      throw new Error(
        `WaifuGuild "${guild.name}" is currently full (${memberCount}/${maxCapacity} members). Level up the guild to expand capacity.`,
      );
    }

    return this.guildRepo.addMember({
      guildId: guild.id,
      userId,
      rank: 'MEMBER',
    });
  }

  /**
   * Leaves the user's current guild.
   */
  async leaveGuild(userId: string): Promise<{ guildName: string; disbanded: boolean }> {
    const userGuild = await this.guildRepo.findUserGuild(userId);
    if (!userGuild) {
      throw new Error('You are not a member of any WaifuGuild.');
    }

    const { guild, member } = userGuild;
    const memberCount = await this.guildRepo.countMembers(guild.id);

    if (member.rank === 'LEADER') {
      if (memberCount > 1) {
        throw new Error(
          'As the Guild Leader, you cannot leave while other members remain. Transfer leadership or disband the guild.',
        );
      } else {
        // Disband solo guild
        await this.guildRepo.delete(guild.id);
        return { guildName: guild.name, disbanded: true };
      }
    }

    await this.guildRepo.removeMember(guild.id, userId);
    return { guildName: guild.name, disbanded: false };
  }

  /**
   * Deposits credits from player wallet into the shared guild bank.
   */
  async depositCredits(
    userId: string,
    amount: number,
  ): Promise<{ newGuildBank: number; remainingWallet: number }> {
    if (amount <= 0 || !Number.isInteger(amount)) {
      throw new Error('Deposit amount must be a positive integer.');
    }

    const userGuild = await this.guildRepo.findUserGuild(userId);
    if (!userGuild) {
      throw new Error('You must be a member of a WaifuGuild to deposit credits.');
    }

    const balance = await this.economyRepo.findById(userId);
    if (!balance || balance.walletBalance < amount) {
      throw new Error(
        `Insufficient credits. You have ${(balance?.walletBalance ?? 0).toLocaleString()} Credits.`,
      );
    }

    return withTransaction(this.dbClient, async (tx) => {
      const updateRes = await this.economyRepo.modifyBalance(
        {
          userId,
          walletDelta: -amount,
          type: 'GUILD_BANK_DEPOSIT',
          source: 'WAIFU_GUILD',
        },
        tx,
      );
      const updatedGuild = await this.guildRepo.modifyGuildBank(userGuild.guild.id, amount, tx);

      return {
        newGuildBank: updatedGuild.guildBank,
        remainingWallet: updateRes.balance.walletBalance,
      };
    });
  }

  /**
   * Records battle XP earned by a member, awarding contribution XP and advancing guild level.
   */
  async recordBattleXp(
    userId: string,
    xpAmount: number,
  ): Promise<{ guildLeveledUp: boolean; newLevel: number } | null> {
    if (xpAmount <= 0) return null;

    const userGuild = await this.guildRepo.findUserGuild(userId);
    if (!userGuild) return null;

    const guildId = userGuild.guild.id;

    return withTransaction(this.dbClient, async (tx) => {
      // Add contribution XP to member
      await this.guildRepo.addContributionXp(guildId, userId, xpAmount, tx);

      // Add XP to guild
      const updatedGuild = await this.guildRepo.addGuildXp(guildId, xpAmount, tx);

      let currentLevel = updatedGuild.level;
      let currentXp = updatedGuild.guildXp;
      let leveledUp = false;

      let requiredXp = this.calculateXpToNextLevel(currentLevel);
      while (currentXp >= requiredXp) {
        currentXp -= requiredXp;
        currentLevel += 1;
        leveledUp = true;
        requiredXp = this.calculateXpToNextLevel(currentLevel);
      }

      if (leveledUp) {
        await this.guildRepo.update(
          guildId,
          {
            level: currentLevel,
            guildXp: currentXp,
          },
          tx,
        );
      }

      return {
        guildLeveledUp: leveledUp,
        newLevel: currentLevel,
      };
    });
  }

  /**
   * Promotes or demotes a guild member (Leader only).
   */
  async updateMemberRank(
    leaderUserId: string,
    targetUserId: string,
    newRank: 'OFFICER' | 'MEMBER',
  ): Promise<WaifuGuildMember> {
    const leaderGuild = await this.guildRepo.findUserGuild(leaderUserId);
    if (!leaderGuild || leaderGuild.member.rank !== 'LEADER') {
      throw new Error('Only the Guild Leader can promote or demote members.');
    }

    const targetMember = await this.guildRepo.findMember(leaderGuild.guild.id, targetUserId);
    if (!targetMember) {
      throw new Error('Target user is not a member of your WaifuGuild.');
    }

    if (targetUserId === leaderUserId) {
      throw new Error('You cannot change your own rank. Transfer leadership instead.');
    }

    return this.guildRepo.updateMemberRank(leaderGuild.guild.id, targetUserId, newRank);
  }

  /**
   * Transfers guild leadership to another member.
   */
  async transferLeadership(leaderUserId: string, newLeaderUserId: string): Promise<WaifuGuild> {
    const leaderGuild = await this.guildRepo.findUserGuild(leaderUserId);
    if (!leaderGuild || leaderGuild.member.rank !== 'LEADER') {
      throw new Error('Only the Guild Leader can transfer leadership.');
    }

    if (leaderUserId === newLeaderUserId) {
      throw new Error('You are already the Guild Leader.');
    }

    const targetMember = await this.guildRepo.findMember(leaderGuild.guild.id, newLeaderUserId);
    if (!targetMember) {
      throw new Error('Target user is not a member of your WaifuGuild.');
    }

    return withTransaction(this.dbClient, async (tx) => {
      await this.guildRepo.updateMemberRank(leaderGuild.guild.id, leaderUserId, 'OFFICER', tx);
      await this.guildRepo.updateMemberRank(leaderGuild.guild.id, newLeaderUserId, 'LEADER', tx);
      return this.guildRepo.update(
        leaderGuild.guild.id,
        { leaderUserId: newLeaderUserId },
        tx,
      );
    });
  }

  /**
   * Kicks a member from the guild (Leader or Officer).
   */
  async kickMember(actorUserId: string, targetUserId: string): Promise<boolean> {
    const actorGuild = await this.guildRepo.findUserGuild(actorUserId);
    if (!actorGuild) {
      throw new Error('You are not in a WaifuGuild.');
    }

    if (actorGuild.member.rank !== 'LEADER' && actorGuild.member.rank !== 'OFFICER') {
      throw new Error('Only Guild Leaders and Officers can kick members.');
    }

    const targetMember = await this.guildRepo.findMember(actorGuild.guild.id, targetUserId);
    if (!targetMember) {
      throw new Error('Target user is not a member of your WaifuGuild.');
    }

    if (targetMember.rank === 'LEADER') {
      throw new Error('The Guild Leader cannot be kicked.');
    }

    if (actorGuild.member.rank === 'OFFICER' && targetMember.rank === 'OFFICER') {
      throw new Error('Officers cannot kick other Officers.');
    }

    return this.guildRepo.removeMember(actorGuild.guild.id, targetUserId);
  }

  /**
   * Retrieves full details for a guild by name or ID.
   */
  async getGuildDetails(guildNameOrId: string): Promise<GuildDetails> {
    const guild =
      (await this.guildRepo.findById(guildNameOrId)) ??
      (await this.guildRepo.findByName(guildNameOrId));

    if (!guild) {
      throw new Error(`WaifuGuild "${guildNameOrId}" not found.`);
    }

    const members = await this.guildRepo.listMembers(guild.id);
    const memberCount = members.length;
    const maxMembers = this.calculateMaxMembers(guild.level);
    const xpToNextLevel = this.calculateXpToNextLevel(guild.level);

    return {
      guild,
      members,
      memberCount,
      maxMembers,
      xpToNextLevel,
    };
  }

  /**
   * Retrieves user's guild details if they are in one.
   */
  async getUserGuildDetails(userId: string): Promise<GuildDetails | null> {
    const userGuild = await this.guildRepo.findUserGuild(userId);
    if (!userGuild) return null;
    return this.getGuildDetails(userGuild.guild.id);
  }

  /**
   * Lists the top WaifuGuilds ranked by level and XP.
   */
  async getLeaderboard(limit = 10, offset = 0): Promise<WaifuGuild[]> {
    return this.guildRepo.listGuildsByRank(limit, offset);
  }
}
