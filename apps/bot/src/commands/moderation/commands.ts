import {
  EmbedBuilder,
  PermissionFlagsBits,
  type GuildMember,
  type GuildTextBasedChannel,
  type User,
} from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';
import type { AutoModRuleType } from '@ririko/services';

/**
 * Parses duration strings like "10m", "1h", "1d", "7d", "600s" or raw numbers into seconds.
 */
export function parseDurationToSeconds(input: string | null | undefined): number | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();

  // Direct number of seconds
  if (/^\d+$/.test(trimmed)) {
    const num = Number.parseInt(trimmed, 10);
    return num > 0 ? num : null;
  }

  const match = /^(\d+)\s*(s|m|h|d|w)$/.exec(trimmed);
  if (!match) return null;

  const value = Number.parseInt(match[1]!, 10);
  const unit = match[2]!;

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    case 'w':
      return value * 604800;
    default:
      return null;
  }
}

/**
 * Formats duration seconds into readable string (e.g. "10 minutes", "1 hour").
 */
export function formatDurationSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
  return `${Math.floor(seconds / 86400)} days`;
}

/**
 * Creates the complete Moderation 2.0 dual-dispatch command suite.
 */
export function createModerationCommands(services: BotServices): Command[] {
  // 1. Warn Command
  const warnCommand: Command = {
    metadata: {
      name: 'warn',
      category: CommandCategory.MODERATION,
      description: 'Issues a formal disciplinary warning to a member with automatic escalation.',
      aliases: ['w'],
      usage: '/warn <user> <reason> [severity: 1-5] [send_dm]',
      userPermissions: [PermissionFlagsBits.ModerateMembers],
      options: [
        {
          name: 'user',
          description: 'The target member to warn',
          type: 'USER',
          required: true,
        },
        {
          name: 'reason',
          description: 'Reason for the formal warning',
          type: 'STRING',
          required: true,
        },
        {
          name: 'severity',
          description: 'Severity weight of the warning (1-5, default 1)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'send_dm',
          description: 'Whether to attempt sending a DM notification (default: true)',
          type: 'BOOLEAN',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild || !ctx.member) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      const targetUser = await ctx.options.getUser('user', true);
      const reason = ctx.options.getString('reason', true) ?? 'No reason provided';
      const severity = ctx.options.getInteger('severity') ?? 1;
      const sendDm = ctx.options.getBoolean('send_dm') ?? true;

      if (!targetUser) {
        await ctx.reply({ content: '❌ Target member was not found.' });
        return;
      }

      let targetMember: GuildMember | null = null;
      try {
        targetMember = await ctx.guild.members.fetch(targetUser.id);
      } catch {
        // Target not in guild
      }

      if (!targetMember) {
        await ctx.reply({ content: '❌ Target user is not a member of this server.' });
        return;
      }

      const invokerMember = ctx.member as GuildMember;

      const result = await services.warningEscalationService.issueWarning({
        guild: ctx.guild,
        invoker: invokerMember,
        target: targetMember,
        reason,
        severity,
        sendDm,
      });

      if (!result.success) {
        await ctx.reply({ content: `❌ Warning failed: ${result.error ?? 'Unknown error'}` });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`⚠️ Warning Issued — Case #${result.caseNumber ?? '?'}`)
        .setColor(0xf1c40f)
        .addFields(
          { name: 'Target Member', value: `<@${targetMember.id}> (${targetMember.user.tag})`, inline: true },
          { name: 'Moderator', value: `<@${ctx.user.id}>`, inline: true },
          { name: 'Severity', value: `${severity}`, inline: true },
          { name: 'Reason', value: reason, inline: false },
          {
            name: 'Active Warnings Summary',
            value: `• Active Warnings: **${result.totalActiveWarnings}**\n• Cumulative Score: **${result.cumulativeScore} pts**`,
            inline: true,
          },
          {
            name: 'DM Notification',
            value: result.dmSent ? '✅ Delivered' : '⚠️ Blocked / Failed',
            inline: true,
          },
        )
        .setTimestamp();

      if (result.escalationTriggered) {
        embed.addFields({
          name: '🚨 Automatic Escalation Triggered!',
          value: `Infraction threshold reached step: **${result.escalationTriggered.action}**${result.escalationTriggered.durationSeconds
              ? ` (${formatDurationSeconds(result.escalationTriggered.durationSeconds)})`
              : ''
            }`,
          inline: false,
        });
      }

      await ctx.reply({ embeds: [embed] });
    },
  };

  // 2. Timeout Command
  const timeoutCommand: Command = {
    metadata: {
      name: 'timeout',
      category: CommandCategory.MODERATION,
      description: 'Times out a member, preventing them from speaking or reacting.',
      aliases: ['mute', 'to'],
      usage: '/timeout <user> <duration> [reason] [send_dm]',
      userPermissions: [PermissionFlagsBits.ModerateMembers],
      options: [
        {
          name: 'user',
          description: 'The target member to timeout',
          type: 'USER',
          required: true,
        },
        {
          name: 'duration',
          description: 'Duration (e.g. 10m, 1h, 1d, 7d)',
          type: 'STRING',
          required: true,
        },
        {
          name: 'reason',
          description: 'Reason for the communication timeout',
          type: 'STRING',
          required: false,
        },
        {
          name: 'send_dm',
          description: 'Whether to send a DM notification (default: true)',
          type: 'BOOLEAN',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild || !ctx.member) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      const targetUser = await ctx.options.getUser('user', true);
      const rawDuration = ctx.options.getString('duration', true);
      const reason = ctx.options.getString('reason') ?? 'No reason provided';
      const sendDm = ctx.options.getBoolean('send_dm') ?? true;

      if (!targetUser) {
        await ctx.reply({ content: '❌ Target member was not found.' });
        return;
      }

      const durationSeconds = parseDurationToSeconds(rawDuration);
      if (!durationSeconds || durationSeconds <= 0 || durationSeconds > 28 * 86400) {
        await ctx.reply({
          content: '❌ Invalid duration. Must be between 1 second and 28 days (e.g. `10m`, `1h`, `1d`).',
        });
        return;
      }

      let targetMember: GuildMember | null = null;
      try {
        targetMember = await ctx.guild.members.fetch(targetUser.id);
      } catch {
        // Target not found
      }

      if (!targetMember) {
        await ctx.reply({ content: '❌ Target member was not found in this server.' });
        return;
      }

      const res = await services.moderationActionService.timeout({
        guild: ctx.guild,
        invoker: ctx.member as GuildMember,
        target: targetMember,
        durationSeconds,
        reason,
        sendDm,
      });

      if (!res.success) {
        await ctx.reply({ content: `❌ Timeout failed: ${res.error ?? 'Unknown error'}` });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`⏳ Member Timed Out — Case #${res.caseNumber ?? '?'}`)
        .setColor(0xfee75c)
        .addFields(
          { name: 'Target', value: `<@${targetMember.id}> (${targetMember.user.tag})`, inline: true },
          { name: 'Duration', value: formatDurationSeconds(durationSeconds), inline: true },
          { name: 'Moderator', value: `<@${ctx.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        )
        .setTimestamp();

      await ctx.reply({ embeds: [embed] });
    },
  };

  // 3. Untimeout Command
  const untimeoutCommand: Command = {
    metadata: {
      name: 'untimeout',
      category: CommandCategory.MODERATION,
      description: 'Removes an active communication timeout from a member.',
      aliases: ['unmute'],
      usage: '/untimeout <user> [reason]',
      userPermissions: [PermissionFlagsBits.ModerateMembers],
      options: [
        {
          name: 'user',
          description: 'The target member to untimeout',
          type: 'USER',
          required: true,
        },
        {
          name: 'reason',
          description: 'Reason for lifting the timeout',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild || !ctx.member) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      const targetUser = await ctx.options.getUser('user', true);
      const reason = ctx.options.getString('reason') ?? 'Timeout removed by moderator';

      if (!targetUser) {
        await ctx.reply({ content: '❌ Target member was not found.' });
        return;
      }

      let targetMember: GuildMember | null = null;
      try {
        targetMember = await ctx.guild.members.fetch(targetUser.id);
      } catch {
        // Not found
      }

      if (!targetMember) {
        await ctx.reply({ content: '❌ Target member was not found in this server.' });
        return;
      }

      const res = await services.moderationActionService.untimeout({
        guild: ctx.guild,
        invoker: ctx.member as GuildMember,
        target: targetMember,
        reason,
      });

      if (!res.success) {
        await ctx.reply({ content: `❌ Untimeout failed: ${res.error ?? 'Unknown error'}` });
        return;
      }

      await ctx.reply({
        content: `✅ Successfully lifted timeout for <@${targetMember.id}>. Reason: *${reason}*`,
      });
    },
  };

  // 4. Kick Command
  const kickCommand: Command = {
    metadata: {
      name: 'kick',
      category: CommandCategory.MODERATION,
      description: 'Kicks a member from the server.',
      aliases: ['boot'],
      usage: '/kick <user> [reason] [send_dm]',
      userPermissions: [PermissionFlagsBits.KickMembers],
      options: [
        {
          name: 'user',
          description: 'The target member to kick',
          type: 'USER',
          required: true,
        },
        {
          name: 'reason',
          description: 'Reason for the kick',
          type: 'STRING',
          required: false,
        },
        {
          name: 'send_dm',
          description: 'Whether to send a DM notification (default: true)',
          type: 'BOOLEAN',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild || !ctx.member) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      const targetUser = await ctx.options.getUser('user', true);
      const reason = ctx.options.getString('reason') ?? 'No reason provided';
      const sendDm = ctx.options.getBoolean('send_dm') ?? true;

      if (!targetUser) {
        await ctx.reply({ content: '❌ Target member was not found.' });
        return;
      }

      let targetMember: GuildMember | null = null;
      try {
        targetMember = await ctx.guild.members.fetch(targetUser.id);
      } catch {
        // Not found
      }

      if (!targetMember) {
        await ctx.reply({ content: '❌ Target member was not found in this server.' });
        return;
      }

      const res = await services.moderationActionService.kick({
        guild: ctx.guild,
        invoker: ctx.member as GuildMember,
        target: targetMember,
        reason,
        sendDm,
      });

      if (!res.success) {
        await ctx.reply({ content: `❌ Kick failed: ${res.error ?? 'Unknown error'}` });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`👢 Member Kicked — Case #${res.caseNumber ?? '?'}`)
        .setColor(0xe67e22)
        .addFields(
          { name: 'Target', value: `<@${targetMember.id}> (${targetMember.user.tag})`, inline: true },
          { name: 'Moderator', value: `<@${ctx.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        )
        .setTimestamp();

      await ctx.reply({ embeds: [embed] });
    },
  };

  // 5. Softban Command
  const softbanCommand: Command = {
    metadata: {
      name: 'softban',
      category: CommandCategory.MODERATION,
      description: 'Bans and immediately unbans a member to purge recent messages.',
      aliases: ['sb'],
      usage: '/softban <user> [days: 1-7] [reason] [send_dm]',
      userPermissions: [PermissionFlagsBits.BanMembers],
      options: [
        {
          name: 'user',
          description: 'The target member to softban',
          type: 'USER',
          required: true,
        },
        {
          name: 'reason',
          description: 'Reason for the softban',
          type: 'STRING',
          required: false,
        },
        {
          name: 'days',
          description: 'Days of message history to delete (1-7, default: 1)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'send_dm',
          description: 'Whether to send a DM notification (default: true)',
          type: 'BOOLEAN',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild || !ctx.member) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      const targetUser = await ctx.options.getUser('user', true);
      const reason = ctx.options.getString('reason') ?? 'No reason provided';
      const days = ctx.options.getInteger('days') ?? 1;
      const sendDm = ctx.options.getBoolean('send_dm') ?? true;

      if (!targetUser) {
        await ctx.reply({ content: '❌ Target member was not found.' });
        return;
      }

      let targetMember: GuildMember | null = null;
      try {
        targetMember = await ctx.guild.members.fetch(targetUser.id);
      } catch {
        // Not found
      }

      if (!targetMember) {
        await ctx.reply({ content: '❌ Target member was not found in this server.' });
        return;
      }

      const res = await services.moderationActionService.softban({
        guild: ctx.guild,
        invoker: ctx.member as GuildMember,
        target: targetMember,
        deleteMessageDays: days,
        reason,
        sendDm,
      });

      if (!res.success) {
        await ctx.reply({ content: `❌ Softban failed: ${res.error ?? 'Unknown error'}` });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔨 Member Softbanned — Case #${res.caseNumber ?? '?'}`)
        .setColor(0xe74c3c)
        .addFields(
          { name: 'Target', value: `<@${targetMember.id}> (${targetMember.user.tag})`, inline: true },
          { name: 'Purged Message Days', value: `${days} days`, inline: true },
          { name: 'Moderator', value: `<@${ctx.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        )
        .setTimestamp();

      await ctx.reply({ embeds: [embed] });
    },
  };

  // 6. Ban Command
  const banCommand: Command = {
    metadata: {
      name: 'ban',
      category: CommandCategory.MODERATION,
      description: 'Permanently bans a member from the server.',
      aliases: ['b'],
      usage: '/ban <user> [days: 0-7] [reason] [send_dm]',
      userPermissions: [PermissionFlagsBits.BanMembers],
      options: [
        {
          name: 'user',
          description: 'The target member to ban',
          type: 'USER',
          required: true,
        },
        {
          name: 'reason',
          description: 'Reason for the permanent ban',
          type: 'STRING',
          required: false,
        },
        {
          name: 'days',
          description: 'Days of message history to delete (0-7, default: 0)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'send_dm',
          description: 'Whether to send a DM notification (default: true)',
          type: 'BOOLEAN',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild || !ctx.member) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      const targetUser = await ctx.options.getUser('user', true);
      const reason = ctx.options.getString('reason') ?? 'No reason provided';
      const days = ctx.options.getInteger('days') ?? 0;
      const sendDm = ctx.options.getBoolean('send_dm') ?? true;

      if (!targetUser) {
        await ctx.reply({ content: '❌ Target member was not found.' });
        return;
      }

      let target: GuildMember | string = targetUser.id;
      try {
        const member = await ctx.guild.members.fetch(targetUser.id);
        if (member) target = member;
      } catch {
        // Fallback to user ID string ban
      }

      const res = await services.moderationActionService.ban({
        guild: ctx.guild,
        invoker: ctx.member as GuildMember,
        target,
        deleteMessageDays: days,
        reason,
        sendDm,
      });

      if (!res.success) {
        await ctx.reply({ content: `❌ Ban failed: ${res.error ?? 'Unknown error'}` });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🚫 Member Banned — Case #${res.caseNumber ?? '?'}`)
        .setColor(0xed4245)
        .addFields(
          { name: 'Target', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
          { name: 'Deleted History', value: `${days} days`, inline: true },
          { name: 'Moderator', value: `<@${ctx.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        )
        .setTimestamp();

      await ctx.reply({ embeds: [embed] });
    },
  };

  // 7. Unban Command
  const unbanCommand: Command = {
    metadata: {
      name: 'unban',
      category: CommandCategory.MODERATION,
      description: 'Revokes a server ban by user ID.',
      usage: '/unban <user_id> [reason]',
      userPermissions: [PermissionFlagsBits.BanMembers],
      options: [
        {
          name: 'user_id',
          description: 'The Discord user ID to unban',
          type: 'STRING',
          required: true,
        },
        {
          name: 'reason',
          description: 'Reason for revoking the ban',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild || !ctx.member) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      const targetUserId = ctx.options.getString('user_id', true) ?? '';
      const reason = ctx.options.getString('reason') ?? 'Ban revoked by staff';

      const res = await services.moderationActionService.unban({
        guild: ctx.guild,
        invoker: ctx.member as GuildMember,
        targetUserId,
        reason,
      });

      if (!res.success) {
        await ctx.reply({ content: `❌ Unban failed: ${res.error ?? 'Unknown error'}` });
        return;
      }

      await ctx.reply({
        content: `✅ Successfully unbanned user \`${targetUserId}\`. Reason: *${reason}*`,
      });
    },
  };

  // 8. Purge Command
  const purgeCommand: Command = {
    metadata: {
      name: 'purge',
      category: CommandCategory.MODERATION,
      description: 'Bulk deletes messages in the current channel with optional filter criteria.',
      aliases: ['clear', 'clean'],
      usage: '/purge <count> [user] [invites_only] [bots_only] [links_only] [attachments_only]',
      userPermissions: [PermissionFlagsBits.ManageMessages],
      options: [
        {
          name: 'count',
          description: 'Number of messages to scan and delete (1-100)',
          type: 'INTEGER',
          required: true,
        },
        {
          name: 'user',
          description: 'Target specific user messages to delete',
          type: 'USER',
          required: false,
        },
        {
          name: 'invites_only',
          description: 'Filter only messages containing Discord invites',
          type: 'BOOLEAN',
          required: false,
        },
        {
          name: 'bots_only',
          description: 'Filter only messages sent by bot accounts',
          type: 'BOOLEAN',
          required: false,
        },
        {
          name: 'links_only',
          description: 'Filter only messages containing web links',
          type: 'BOOLEAN',
          required: false,
        },
        {
          name: 'attachments_only',
          description: 'Filter only messages with attachments',
          type: 'BOOLEAN',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild || !ctx.member || !ctx.channel) {
        await ctx.reply({ content: '❌ This command can only be used within a server text channel.' });
        return;
      }

      const count = ctx.options.getInteger('count', true) ?? 0;
      const targetUser = await ctx.options.getUser('user');
      const invitesOnly = ctx.options.getBoolean('invites_only') ?? false;
      const botsOnly = ctx.options.getBoolean('bots_only') ?? false;
      const linksOnly = ctx.options.getBoolean('links_only') ?? false;
      const attachmentsOnly = ctx.options.getBoolean('attachments_only') ?? false;

      if (count < 1 || count > 100) {
        await ctx.reply({ content: '❌ Purge count must be between 1 and 100.' });
        return;
      }

      const textChannel = ctx.channel as unknown as GuildTextBasedChannel;
      const invokerMember = ctx.member as GuildMember;

      const res = await services.purgeService.purgeMessages({
        guild: ctx.guild,
        channel: textChannel,
        invoker: invokerMember,
        count,
        filters: {
          userId: targetUser?.id,
          invitesOnly,
          botsOnly,
          linksOnly,
          attachmentsOnly,
        },
      });

      if (!res.success) {
        await ctx.reply({ content: `❌ Purge failed: ${res.error ?? 'Unknown error'}` });
        return;
      }

      let replyMsg = `🧹 Successfully deleted **${res.deletedCount}** message${res.deletedCount === 1 ? '' : 's'}.`;
      if (res.skippedOlderThan14Days > 0) {
        replyMsg += ` *(Skipped ${res.skippedOlderThan14Days} message(s) older than 14 days due to Discord limits)*`;
      }

      await ctx.reply({ content: replyMsg });
    },
  };

  // 9. Lock Command
  const lockCommand: Command = {
    metadata: {
      name: 'lock',
      category: CommandCategory.MODERATION,
      description: 'Locks the channel, preventing @everyone from sending messages.',
      usage: '/lock [channel] [reason]',
      userPermissions: [PermissionFlagsBits.ManageChannels],
      options: [
        {
          name: 'channel',
          description: 'Channel to lock (defaults to current channel)',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'reason',
          description: 'Reason for locking the channel',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild || !ctx.member || !ctx.channel) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      const channelOpt = await ctx.options.getChannel('channel');
      const targetChannel = ((channelOpt ?? ctx.channel) as unknown) as GuildTextBasedChannel;
      const reason = ctx.options.getString('reason') ?? 'Channel locked by staff';

      const res = await services.moderationActionService.lockChannel({
        guild: ctx.guild,
        invoker: ctx.member as GuildMember,
        channel: targetChannel,
        reason,
      });

      if (!res.success) {
        await ctx.reply({ content: `❌ Lock failed: ${res.error ?? 'Unknown error'}` });
        return;
      }

      await ctx.reply({
        content: `🔒 **Channel Locked:** <#${targetChannel.id}> is now locked for @everyone. Reason: *${reason}*`,
      });
    },
  };

  // 10. Unlock Command
  const unlockCommand: Command = {
    metadata: {
      name: 'unlock',
      category: CommandCategory.MODERATION,
      description: 'Unlocks the channel, restoring @everyone send messages permissions.',
      usage: '/unlock [channel] [reason]',
      userPermissions: [PermissionFlagsBits.ManageChannels],
      options: [
        {
          name: 'channel',
          description: 'Channel to unlock (defaults to current channel)',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'reason',
          description: 'Reason for unlocking the channel',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild || !ctx.member || !ctx.channel) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      const channelOpt = await ctx.options.getChannel('channel');
      const targetChannel = ((channelOpt ?? ctx.channel) as unknown) as GuildTextBasedChannel;
      const reason = ctx.options.getString('reason') ?? 'Channel unlocked by staff';

      const res = await services.moderationActionService.unlockChannel({
        guild: ctx.guild,
        invoker: ctx.member as GuildMember,
        channel: targetChannel,
        reason,
      });

      if (!res.success) {
        await ctx.reply({ content: `❌ Unlock failed: ${res.error ?? 'Unknown error'}` });
        return;
      }

      await ctx.reply({
        content: `🔓 **Channel Unlocked:** <#${targetChannel.id}> is now unlocked for @everyone. Reason: *${reason}*`,
      });
    },
  };

  // 11. Nick Command
  const nickCommand: Command = {
    metadata: {
      name: 'nick',
      category: CommandCategory.MODERATION,
      description: 'Moderates or resets a member nickname.',
      aliases: ['nickname'],
      usage: '/nick <user> [nickname] [reason]',
      userPermissions: [PermissionFlagsBits.ManageNicknames],
      options: [
        {
          name: 'user',
          description: 'Target member whose nickname to change',
          type: 'USER',
          required: true,
        },
        {
          name: 'nickname',
          description: 'New nickname (leave empty to reset to username)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'reason',
          description: 'Reason for the nickname modification',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild || !ctx.member) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      const targetUser = await ctx.options.getUser('user', true);
      const nickname = ctx.options.getString('nickname') ?? null;
      const reason = ctx.options.getString('reason') ?? 'Nickname moderated by staff';

      if (!targetUser) {
        await ctx.reply({ content: '❌ Target member was not found.' });
        return;
      }

      let targetMember: GuildMember | null = null;
      try {
        targetMember = await ctx.guild.members.fetch(targetUser.id);
      } catch {
        // Not found
      }

      if (!targetMember) {
        await ctx.reply({ content: '❌ Target member was not found in this server.' });
        return;
      }

      const res = await services.moderationActionService.setNickname({
        guild: ctx.guild,
        invoker: ctx.member as GuildMember,
        target: targetMember,
        nickname,
        reason,
      });

      if (!res.success) {
        await ctx.reply({ content: `❌ Nickname change failed: ${res.error ?? 'Unknown error'}` });
        return;
      }

      await ctx.reply({
        content: `✅ Successfully ${nickname ? `changed <@${targetMember.id}>'s nickname to **${nickname}**` : `reset <@${targetMember.id}>'s nickname`}.`,
      });
    },
  };

  // 12. History Command
  const historyCommand: Command = {
    metadata: {
      name: 'history',
      category: CommandCategory.MODERATION,
      description: 'Views a member comprehensive disciplinary history and risk profile.',
      aliases: ['modlogs', 'cases'],
      usage: '/history <user>',
      userPermissions: [PermissionFlagsBits.ModerateMembers],
      options: [
        {
          name: 'user',
          description: 'The member whose disciplinary records to inspect',
          type: 'USER',
          required: true,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      const targetUser = await ctx.options.getUser('user', true);
      if (!targetUser) {
        await ctx.reply({ content: '❌ Target member was not found.' });
        return;
      }

      const summary = await services.disciplinaryHistoryService.getSummary(ctx.guild.id, targetUser.id);
      const embed = services.disciplinaryHistoryService.buildHistoryEmbed(summary, targetUser);

      await ctx.reply({ embeds: [embed] });
    },
  };

  // 13. Note Command
  const noteCommand: Command = {
    metadata: {
      name: 'note',
      category: CommandCategory.MODERATION,
      description: 'Manages persistent staff notes attached to a member.',
      usage: '/note <action: add|view> <user> [content]',
      userPermissions: [PermissionFlagsBits.ModerateMembers],
      options: [
        {
          name: 'action',
          description: 'Action to perform (add or view)',
          type: 'STRING',
          required: true,
          choices: [
            { name: 'Add Note', value: 'add' },
            { name: 'View Notes', value: 'view' },
          ],
        },
        {
          name: 'user',
          description: 'The target member',
          type: 'USER',
          required: true,
        },
        {
          name: 'content',
          description: 'Note content (required when adding a note)',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      const action = (ctx.options.getString('action', true) ?? '').toLowerCase();
      const targetUser = await ctx.options.getUser('user', true);
      const content = ctx.options.getString('content');

      if (!targetUser) {
        await ctx.reply({ content: '❌ Target member was not found.' });
        return;
      }

      if (action === 'add') {
        if (!content || content.trim().length === 0) {
          await ctx.reply({ content: '❌ Please provide note content.' });
          return;
        }

        const note = await services.disciplinaryHistoryService.addNote(
          ctx.guild.id,
          targetUser.id,
          ctx.user.id,
          content.trim(),
        );

        await ctx.reply({
          content: `📝 Added staff note to <@${targetUser.id}>: "${note.content}"`,
        });
      } else if (action === 'view') {
        const notes = await services.moderationRepo.getNotesByUser(ctx.guild.id, targetUser.id);

        if (notes.length === 0) {
          await ctx.reply({ content: `📝 No staff notes found for <@${targetUser.id}>.` });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(`📝 Staff Notes for ${targetUser.tag}`)
          .setColor(0x5865f2)
          .setDescription(
            notes
              .slice(0, 10)
              .map(
                (n, idx) =>
                  `**${idx + 1}.** *${n.content}*\n— By <@${n.authorUserId}> on <t:${Math.floor(
                    n.createdAt.getTime() / 1000,
                  )}:d>`,
              )
              .join('\n\n'),
          )
          .setFooter({ text: `Total notes: ${notes.length}` });

        await ctx.reply({ embeds: [embed] });
      } else {
        await ctx.reply({ content: '❌ Invalid action. Choose `add` or `view`.' });
      }
    },
  };

  // 14. AutoMod Command
  const automodCommand: Command = {
    metadata: {
      name: 'automod',
      category: CommandCategory.MODERATION,
      description: 'Inspects or configures AutoMod and Anti-Raid defensive rules.',
      usage: '/automod <status|enable|disable> [rule]',
      userPermissions: [PermissionFlagsBits.ManageGuild],
      options: [
        {
          name: 'action',
          description: 'Action to perform',
          type: 'STRING',
          required: true,
          choices: [
            { name: 'Status', value: 'status' },
            { name: 'Enable Rule', value: 'enable' },
            { name: 'Disable Rule', value: 'disable' },
          ],
        },
        {
          name: 'rule',
          description: 'Target defensive rule',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Invite Filter', value: 'INVITE_FILTER' },
            { name: 'Phishing Shield', value: 'PHISHING_SHIELD' },
            { name: 'Mention Spam', value: 'MENTION_SPAM' },
            { name: 'Burst Spam', value: 'BURST_SPAM' },
          ],
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      const action = (ctx.options.getString('action', true) ?? '').toLowerCase();
      const ruleType = ctx.options.getString('rule') as AutoModRuleType | null;

      if (action === 'status') {
        const configs = await services.autoModService.getGuildRuleConfigs(ctx.guild.id);
        const raidConfig = services.antiRaidService.getConfig(ctx.guild.id);
        const raidState = services.antiRaidService.getState(ctx.guild.id);

        const embed = new EmbedBuilder()
          .setTitle(`🛡️ Server Defensive Status — ${ctx.guild.name}`)
          .setColor(0x5865f2)
          .addFields(
            {
              name: 'Anti-Raid Monitor',
              value: `• Enabled: ${raidConfig.enabled ? '✅ Yes' : '❌ No'}\n• Status: **${raidState.status}**\n• Threshold: **${raidConfig.joinThreshold} joins / ${raidConfig.windowSeconds}s**\n• Fresh Account Gate: **< ${raidConfig.freshAccountAgeHours}h**`,
              inline: false,
            },
            {
              name: 'AutoMod Rule Status',
              value: Array.from(configs.values())
                .map(
                  (c) =>
                    `• **${c.ruleType}**: ${c.isEnabled ? '✅ Enabled' : '❌ Disabled'} (Action: \`${c.action}\`${c.threshold ? `, Threshold: ${c.threshold}` : ''
                    })`,
                )
                .join('\n'),
              inline: false,
            },
          )
          .setTimestamp();

        await ctx.reply({ embeds: [embed] });
        return;
      }

      if (!ruleType) {
        await ctx.reply({ content: '❌ Please specify a rule to configure.' });
        return;
      }

      const isEnabled = action === 'enable';

      await services.moderationRepo.upsertRule({
        guildId: ctx.guild.id,
        ruleType,
        isEnabled,
      });
      services.autoModService.invalidateRuleCache(ctx.guild.id);

      await ctx.reply({
        content: `🛡️ AutoMod rule **${ruleType}** has been **${isEnabled ? 'enabled' : 'disabled'}** for this server.`,
      });
    },
  };

  return [
    warnCommand,
    timeoutCommand,
    untimeoutCommand,
    kickCommand,
    softbanCommand,
    banCommand,
    unbanCommand,
    purgeCommand,
    lockCommand,
    unlockCommand,
    nickCommand,
    historyCommand,
    noteCommand,
    automodCommand,
  ];
}
