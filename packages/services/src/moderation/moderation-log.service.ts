import {
  EmbedBuilder,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
  type Message,
  type User,
  type GuildMember,
} from 'discord.js';
import type { EventBus, CoreEvents } from '@ririko/core';
import type {
  GuildSettingsRepository,
  ModerationRepository,
  ModerationCase,
} from '@ririko/database';

export const MODERATION_COLORS: Record<string, number> = {
  BAN: 0xed4245, // Red
  SOFTBAN: 0xe74c3c, // Dark Red
  KICK: 0xe67e22, // Orange
  TIMEOUT: 0xfee75c, // Yellow
  WARN: 0xf1c40f, // Amber
  UNBAN: 0x57f287, // Green
  UNTIMEOUT: 0x2ecc71, // Light Green
  LOCK: 0x5865f2, // Blurple
  UNLOCK: 0x3498db, // Light Blue
  NICK: 0x9b59b6, // Purple
  DEFAULT: 0x95a5a6, // Grey
};

export interface BuildEmbedOptions {
  targetUser?: User | GuildMember | null | undefined;
  moderatorUser?: User | GuildMember | null | undefined;
}

export class ModerationLogService {
  constructor(
    private readonly modRepo: ModerationRepository,
    private readonly guildSettingsRepo: GuildSettingsRepository,
    private readonly eventBus?: EventBus<CoreEvents> | undefined,
  ) {}

  /**
   * Constructs a rich embed for a moderation case.
   */
  buildCaseEmbed(modCase: ModerationCase, options: BuildEmbedOptions = {}): EmbedBuilder {
    const actionUpper = (modCase.type ?? 'MODERATION').toUpperCase();
    const color = MODERATION_COLORS[actionUpper] ?? 0x95a5a6;

    const targetTag = options.targetUser
      ? 'user' in options.targetUser
        ? options.targetUser.user.tag
        : options.targetUser.tag
      : modCase.targetUserId;

    const moderatorTag = options.moderatorUser
      ? 'user' in options.moderatorUser
        ? options.moderatorUser.user.tag
        : options.moderatorUser.tag
      : modCase.moderatorUserId;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`Case #${modCase.caseNumber} | ${actionUpper}`)
      .setTimestamp(modCase.createdAt ? new Date(modCase.createdAt) : new Date())
      .setFooter({ text: `Case ID: ${modCase.id}` });

    embed.addFields(
      {
        name: 'Target User',
        value: `<@${modCase.targetUserId}> (${targetTag})`,
        inline: true,
      },
      {
        name: 'Moderator',
        value: `<@${modCase.moderatorUserId}> (${moderatorTag})`,
        inline: true,
      },
      {
        name: 'Reason',
        value: modCase.reason || 'No reason provided',
        inline: false,
      },
    );

    if (modCase.durationSeconds) {
      embed.addFields({
        name: 'Duration',
        value: this.formatDuration(modCase.durationSeconds),
        inline: true,
      });
    }

    if (modCase.metadata && typeof modCase.metadata === 'object') {
      const meta = modCase.metadata as Record<string, unknown>;
      if (meta.deleteMessageDays !== undefined) {
        embed.addFields({
          name: 'Messages Purged',
          value: `${meta.deleteMessageDays} day(s)`,
          inline: true,
        });
      }
      if (meta.newNickname !== undefined) {
        embed.addFields({
          name: 'New Nickname',
          value: meta.newNickname ? String(meta.newNickname) : '*Reset to default*',
          inline: true,
        });
      }
    }

    return embed;
  }

  /**
   * Dispatches a case embed to the guild's configured log channel.
   */
  async logCase(guild: Guild, modCase: ModerationCase): Promise<Message | null> {
    const settings = await this.guildSettingsRepo.getByGuildId(guild.id).catch(() => null);
    if (!settings?.logChannelId) {
      return null;
    }

    const channel = await guild.channels.fetch(settings.logChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return null;
    }

    const textChannel = channel as GuildTextBasedChannel;
    const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (
      botMember &&
      !textChannel.permissionsFor(botMember)?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])
    ) {
      return null;
    }

    const targetUser = await guild.client.users.fetch(modCase.targetUserId).catch(() => null);
    const modUser = await guild.client.users.fetch(modCase.moderatorUserId).catch(() => null);

    const embed = this.buildCaseEmbed(modCase, {
      targetUser,
      moderatorUser: modUser,
    });

    try {
      return await textChannel.send({ embeds: [embed] });
    } catch (err: unknown) {
      console.error(
        `[ModerationLogService] Failed to send case embed to channel ${settings.logChannelId}:`,
        err,
      );
      return null;
    }
  }

  /**
   * Subscribes to the EventBus to automatically dispatch moderation case logs.
   */
  startListening(client: Client): (() => void) | null {
    if (!this.eventBus) return null;

    return this.eventBus.on('moderation:caseCreated', async (payload) => {
      try {
        const guild =
          client.guilds.cache.get(payload.guildId) ??
          (await client.guilds.fetch(payload.guildId).catch(() => null));
        if (!guild) return;

        const modCase = await this.modRepo.getCaseByNumber(payload.guildId, payload.caseNumber);
        if (!modCase) return;

        await this.logCase(guild, modCase);
      } catch (err: unknown) {
        console.error(
          '[ModerationLogService] Event listener error on moderation:caseCreated:',
          err,
        );
      }
    });
  }

  private formatDuration(seconds: number): string {
    if (seconds >= 86400) {
      const days = Math.floor(seconds / 86400);
      return `${days}d`;
    }
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600);
      return `${hours}h`;
    }
    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m`;
    }
    return `${seconds}s`;
  }
}
