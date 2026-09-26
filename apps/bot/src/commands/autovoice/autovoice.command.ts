import { EmbedBuilder, PermissionFlagsBits, ChannelType, type VoiceChannel } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { resolveContextPrefix } from '../shared/prefix-resolver.js';

function hasAdminPermission(ctx: CommandContext): boolean {
  if (!ctx.member) return true; // Direct/test mock fallback
  const perms = ctx.member.permissions;
  return (
    perms.has(PermissionFlagsBits.ManageChannels) ||
    perms.has(PermissionFlagsBits.ManageGuild) ||
    perms.has(PermissionFlagsBits.Administrator)
  );
}

export function createAutoVoiceCommands(services: BotServices): Command[] {
  // 1. Primary /autovoice management command
  const autovoiceCommand: Command = {
    metadata: {
      name: 'autovoice',
      category: CommandCategory.UTILITY,
      description: 'Configure and manage automatic "Join to Create" voice channels',
      usage: '/autovoice <setup|remove|list>',
      examples: [
        '/autovoice setup channel:#join-to-create template:"{user}\'s Room" limit:5 bitrate:64000',
        '/autovoice remove channel:#join-to-create',
        '/autovoice list',
      ],
      options: [
        {
          name: 'action',
          description: 'Auto-voice configuration action',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Setup (Configure Join to Create channel)', value: 'setup' },
            { name: 'Remove (Unconfigure Join to Create channel)', value: 'remove' },
            { name: 'List (View server auto-voice configs)', value: 'list' },
          ],
        },
        {
          name: 'channel',
          description: 'Target voice channel to configure as Join to Create',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'template',
          description: 'Dynamic channel name template (use {user} placeholder)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'limit',
          description: 'Default user limit for created channels (0 for unlimited)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'bitrate',
          description: 'Default bitrate in bps (e.g. 64000, 96000)',
          type: 'INTEGER',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) {
        await ctx.reply({ content: '❌ Auto-voice commands can only be used within a server.' });
        return;
      }

      const rawArgs = ctx.options.getRawArgs();
      let action = ctx.options.getString('action')?.toLowerCase();
      if (!action) {
        const sub = rawArgs[0]?.toLowerCase();
        if (['setup', 'remove', 'delete', 'list'].includes(sub ?? '')) {
          action = sub === 'delete' ? 'remove' : sub;
        } else {
          action = 'list';
        }
      }

      if (action !== 'list' && !hasAdminPermission(ctx)) {
        await ctx.reply({
          content:
            '❌ You need the **Manage Channels** or **Manage Server** permission to configure auto-voice.',
        });
        return;
      }

      if (action === 'setup') {
        const channelOpt = await ctx.options.getChannel('channel');
        const channelIdInput = channelOpt?.id ?? rawArgs[1]?.replace(/[<#>]/g, '');

        if (!channelIdInput) {
          await ctx.reply({
            content:
              '❌ Please specify the voice channel to use as the "Join to Create" generator.\nExample: `/autovoice setup channel:#JoinToCreate`',
          });
          return;
        }

        const template = ctx.options.getString('template') ?? "{user}'s Room";
        const limit = ctx.options.getInteger('limit') ?? 0;
        const bitrate = ctx.options.getInteger('bitrate') ?? 64000;

        const config = await services.autoVoiceRepo.upsert({
          guildId: ctx.guildId,
          parentChannelId: channelIdInput,
          channelNameTemplate: template,
          userLimit: Math.max(0, Math.min(99, limit)),
          bitrate: Math.max(8000, Math.min(ctx.guild?.maximumBitrate ?? 384000, bitrate)),
        });

        const embed = new EmbedBuilder()
          .setTitle('🔊 Auto-Voice Channel Configured')
          .setDescription(
            `Successfully set <#${config.parentChannelId}> as a **Join to Create** generator.`,
          )
          .addFields(
            { name: 'Name Template', value: `\`${config.channelNameTemplate}\``, inline: true },
            {
              name: 'User Limit',
              value: config.userLimit === 0 ? 'Unlimited' : `${config.userLimit}`,
              inline: true,
            },
            { name: 'Bitrate', value: `${config.bitrate / 1000} kbps`, inline: true },
          )
          .setColor(0x57f287);

        await ctx.reply({ embeds: [embed] });
        return;
      }

      if (action === 'remove') {
        const channelOpt = await ctx.options.getChannel('channel');
        const channelIdInput = channelOpt?.id ?? rawArgs[1]?.replace(/[<#>]/g, '');

        if (!channelIdInput) {
          await ctx.reply({
            content:
              '❌ Please provide the voice channel to remove from auto-voice configs.\nExample: `/autovoice remove channel:#JoinToCreate`',
          });
          return;
        }

        const deleted = await services.autoVoiceRepo.deleteByParentChannelId(
          ctx.guildId,
          channelIdInput,
        );
        if (!deleted) {
          await ctx.reply({
            content: `⚠️ No active auto-voice configuration found for <#${channelIdInput}>.`,
          });
          return;
        }

        await ctx.reply({ content: `🗑️ Removed <#${channelIdInput}> from auto-voice generators.` });
        return;
      }

      if (action === 'list') {
        const configs = await services.autoVoiceRepo.listByGuildId(ctx.guildId);
        if (configs.length === 0) {
          await ctx.reply({
            content:
              '📋 No auto-voice generators configured in this server. Use `/autovoice setup` to create one.',
          });
          return;
        }

        const lines = configs.map((cfg, i) => {
          const limit = cfg.userLimit === 0 ? 'Unlimited' : `${cfg.userLimit}`;
          return `**${i + 1}.** <#${cfg.parentChannelId}>\n• Template: \`${cfg.channelNameTemplate}\`\n• Limit: ${limit} | Bitrate: ${cfg.bitrate / 1000}kbps`;
        });

        const embed = new EmbedBuilder()
          .setTitle('🔊 Server Auto-Voice Generators')
          .setDescription(lines.join('\n\n'))
          .setColor(0x5865f2)
          .setFooter({ text: `Total Configured: ${configs.length}` });

        await ctx.reply({ embeds: [embed] });
        return;
      }

      await ctx.reply({ content: `❌ Unknown auto-voice action: \`${action}\`.` });
    },
  };

  // 2. In-Channel Owner Controls: /voice
  const voiceControlCommand: Command = {
    metadata: {
      name: 'voice',
      category: CommandCategory.UTILITY,
      description: 'Manage your active temporary voice channel (owner only)',
      usage: '/voice <name|limit|lock|permit|kick|claim|transfer>',
      examples: [
        '/voice name name:"Gaming Lounge"',
        '/voice limit limit:4',
        '/voice lock locked:true',
        '/voice permit user:@Bob',
        '/voice kick user:@Troll',
        '/voice claim',
        '/voice transfer user:@Alice',
      ],
      options: [
        {
          name: 'action',
          description: 'Control action to execute',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Name (Rename channel)', value: 'name' },
            { name: 'Limit (Set user limit)', value: 'limit' },
            { name: 'Lock (Lock or unlock channel)', value: 'lock' },
            { name: 'Permit (Allow specific user)', value: 'permit' },
            { name: 'Kick (Disconnect user)', value: 'kick' },
            { name: 'Claim (Claim owner if vacant)', value: 'claim' },
            { name: 'Transfer (Transfer ownership)', value: 'transfer' },
          ],
        },
        {
          name: 'name',
          description: 'New channel name',
          type: 'STRING',
          required: false,
        },
        {
          name: 'limit',
          description: 'User limit (0 for unlimited, max 99)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'locked',
          description: 'Lock state (true to lock, false to unlock)',
          type: 'BOOLEAN',
          required: false,
        },
        {
          name: 'user',
          description: 'Target user for permit, kick, or transfer',
          type: 'USER',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) {
        await ctx.reply({ content: '❌ Voice controls can only be used within a server.' });
        return;
      }

      const rawArgs = ctx.options.getRawArgs();
      let action = ctx.options.getString('action')?.toLowerCase();
      if (!action) {
        action = rawArgs[0]?.toLowerCase() ?? 'help';
      }

      // Resolve caller's current voice channel
      const member = ctx.member as any;
      const voiceChannel = member?.voice?.channel as VoiceChannel | null | undefined;
      if (!voiceChannel) {
        await ctx.reply({
          content: '❌ You must be connected to a voice channel to use voice controls.',
        });
        return;
      }

      // Check if the channel is an active dynamic voice channel
      const active = services.autoVoiceService.getActiveChannel(voiceChannel.id);
      if (!active) {
        await ctx.reply({
          content: '❌ This voice channel is not a temporary dynamic voice channel.',
        });
        return;
      }

      const callerId = ctx.user.id;
      const isOwner = services.autoVoiceService.isOwner(voiceChannel.id, callerId);

      // Claim action: claim ownership if owner left the channel
      if (action === 'claim') {
        if (isOwner) {
          await ctx.reply({ content: '⚠️ You are already the owner of this voice channel!' });
          return;
        }

        const ownerStillHere = voiceChannel.members?.has(active.ownerId) ?? false;
        if (ownerStillHere) {
          await ctx.reply({
            content:
              '❌ The current channel owner is still connected. Ownership cannot be claimed.',
          });
          return;
        }

        services.autoVoiceService.transferOwnership(voiceChannel.id, callerId);
        // Grant permissions to new owner
        await voiceChannel.permissionOverwrites
          .edit(callerId, {
            ViewChannel: true,
            Connect: true,
            Speak: true,
            ManageChannels: true,
            MoveMembers: true,
            MuteMembers: true,
            DeafenMembers: true,
          })
          .catch(() => null);

        await ctx.reply({
          content: `👑 <@${callerId}> has claimed ownership of this voice channel!`,
        });
        return;
      }

      // All other actions require ownership
      if (!isOwner) {
        await ctx.reply({
          content: `❌ Only the channel owner (<@${active.ownerId}>) can manage this channel.`,
        });
        return;
      }

      if (action === 'name') {
        const newName = ctx.options.getString('name') ?? rawArgs.slice(1).join(' ').trim();
        if (!newName) {
          await ctx.reply({ content: '❌ Please provide a new name for the channel.' });
          return;
        }
        await services.autoVoiceService.setChannelName(voiceChannel, newName);
        await ctx.reply({ content: `✓ Channel renamed to **${newName}**.` });
        return;
      }

      if (action === 'limit') {
        const rawLimit =
          ctx.options.getInteger('limit') ?? (rawArgs[1] ? parseInt(rawArgs[1], 10) : null);
        if (rawLimit === null || isNaN(rawLimit) || rawLimit < 0 || rawLimit > 99) {
          await ctx.reply({ content: '❌ Please provide a valid user limit between 0 and 99.' });
          return;
        }
        await services.autoVoiceService.setUserLimit(voiceChannel, rawLimit);
        await ctx.reply({
          content: `✓ User limit set to **${rawLimit === 0 ? 'Unlimited' : rawLimit}**.`,
        });
        return;
      }

      if (action === 'lock') {
        let lockState = ctx.options.getBoolean('locked');
        if (lockState === null || lockState === undefined) {
          // Toggle or check if second arg was "unlock" or "off"
          const secondArg = rawArgs[1]?.toLowerCase();
          if (secondArg === 'off' || secondArg === 'false' || secondArg === 'unlock') {
            lockState = false;
          } else {
            lockState = true;
          }
        }
        await services.autoVoiceService.lockChannel(voiceChannel, lockState);
        await ctx.reply({
          content: lockState
            ? '🔒 Channel **locked**. Other members cannot connect without permission.'
            : '🔓 Channel **unlocked**. Everyone can connect.',
        });
        return;
      }

      if (action === 'permit') {
        const targetUser = await ctx.options.getUser('user');
        const targetUserId = targetUser?.id ?? rawArgs[1]?.replace(/[<@!>]/g, '');
        if (!targetUserId) {
          await ctx.reply({
            content: '❌ Please mention or provide the ID of the user to permit.',
          });
          return;
        }

        await voiceChannel.permissionOverwrites.edit(targetUserId, {
          Connect: true,
          ViewChannel: true,
        });

        await ctx.reply({
          content: `✓ Permitted <@${targetUserId}> to connect to this voice channel.`,
        });
        return;
      }

      if (action === 'kick') {
        const targetUser = await ctx.options.getUser('user');
        const targetUserId = targetUser?.id ?? rawArgs[1]?.replace(/[<@!>]/g, '');
        if (!targetUserId) {
          await ctx.reply({
            content: '❌ Please mention or provide the ID of the user to disconnect.',
          });
          return;
        }

        if (targetUserId === callerId) {
          await ctx.reply({ content: '⚠️ You cannot kick yourself from your own channel.' });
          return;
        }

        const targetMember = voiceChannel.members?.get(targetUserId);
        if (!targetMember) {
          await ctx.reply({ content: `⚠️ <@${targetUserId}> is not in this voice channel.` });
          return;
        }

        await targetMember.voice.disconnect('Kicked by channel owner');
        await ctx.reply({ content: `👢 Disconnected <@${targetUserId}> from the voice channel.` });
        return;
      }

      if (action === 'transfer') {
        const targetUser = await ctx.options.getUser('user');
        const targetUserId = targetUser?.id ?? rawArgs[1]?.replace(/[<@!>]/g, '');
        if (!targetUserId) {
          await ctx.reply({
            content: '❌ Please mention or provide the ID of the user to transfer ownership to.',
          });
          return;
        }

        if (targetUserId === callerId) {
          await ctx.reply({ content: '⚠️ You already own this channel.' });
          return;
        }

        const targetMember = voiceChannel.members?.get(targetUserId);
        if (!targetMember) {
          await ctx.reply({
            content: `⚠️ <@${targetUserId}> must be connected to this channel to transfer ownership.`,
          });
          return;
        }

        services.autoVoiceService.transferOwnership(voiceChannel.id, targetUserId);
        await voiceChannel.permissionOverwrites
          .edit(targetUserId, {
            ViewChannel: true,
            Connect: true,
            Speak: true,
            ManageChannels: true,
            MoveMembers: true,
            MuteMembers: true,
            DeafenMembers: true,
          })
          .catch(() => null);

        await ctx.reply({ content: `👑 Transferred channel ownership to <@${targetUserId}>!` });
        return;
      }

      const prefix = await resolveContextPrefix(ctx, services);
      await ctx.reply({
        content: `❓ Available voice controls:\n\`${prefix}voice name <name>\` • \`${prefix}voice limit <limit>\` • \`${prefix}voice lock <locked>\` • \`${prefix}voice permit <user>\` • \`${prefix}voice kick <user>\` • \`${prefix}voice claim\` • \`${prefix}voice transfer <user>\`\n*(Slash commands like \`/voice <action>\` are also supported)*`,
      });
    },
  };

  // 3. Legacy prefix aliases
  const createLegacyVoiceAlias = (name: string, action: string, description: string): Command => ({
    metadata: {
      name,
      category: CommandCategory.UTILITY,
      description,
      usage: `!${name}`,
    },
    async execute(ctx: CommandContext): Promise<void> {
      const delegatedCtx: CommandContext = {
        ...ctx,
        options: {
          ...ctx.options,
          getString: (opt: string) => {
            if (opt === 'action') return action;
            return ctx.options.getString(opt);
          },
          getBoolean: (opt: string) => {
            if (opt === 'locked' && name === 'vunlock') return false;
            if (opt === 'locked' && name === 'vlock') return true;
            return ctx.options.getBoolean(opt);
          },
        },
      };
      await voiceControlCommand.execute(delegatedCtx);
    },
  });

  const createLegacyAutoVoiceAlias = (name: string, description: string): Command => ({
    metadata: {
      name,
      category: CommandCategory.UTILITY,
      description,
      usage: `!${name}`,
    },
    async execute(ctx: CommandContext): Promise<void> {
      await autovoiceCommand.execute(ctx);
    },
  });

  return [
    autovoiceCommand,
    voiceControlCommand,
    createLegacyAutoVoiceAlias('avc', 'Configure auto-voice channels (legacy alias)'),
    createLegacyVoiceAlias('vname', 'name', 'Rename voice channel (legacy alias)'),
    createLegacyVoiceAlias('vlimit', 'limit', 'Set user limit (legacy alias)'),
    createLegacyVoiceAlias('vlock', 'lock', 'Lock voice channel (legacy alias)'),
    createLegacyVoiceAlias('vunlock', 'lock', 'Unlock voice channel (legacy alias)'),
    createLegacyVoiceAlias('vpermit', 'permit', 'Permit user to voice channel (legacy alias)'),
    createLegacyVoiceAlias('vkick', 'kick', 'Kick user from voice channel (legacy alias)'),
    createLegacyVoiceAlias('vclaim', 'claim', 'Claim vacant voice channel (legacy alias)'),
    createLegacyVoiceAlias(
      'vtransfer',
      'transfer',
      'Transfer voice channel ownership (legacy alias)',
    ),
  ];
}
