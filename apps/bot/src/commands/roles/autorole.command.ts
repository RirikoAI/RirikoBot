import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type TextChannel,
  type Role,
} from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';

function hasAdminPermission(ctx: CommandContext): boolean {
  if (!ctx.member) return true;
  const perms = ctx.member.permissions;
  return (
    perms.has(PermissionFlagsBits.Administrator) ||
    perms.has(PermissionFlagsBits.ManageRoles) ||
    perms.has(PermissionFlagsBits.ManageGuild)
  );
}

function resolveRole(ctx: CommandContext, optionName: string, argIndex: number): Role | null {
  if (!ctx.guild) return null;
  if (ctx.source === 'slash' && 'options' in ctx.raw) {
    const role = (ctx.raw as any).options?.getRole?.(optionName);
    if (role) return role;
  }
  const rawArgs = ctx.options.getRawArgs();
  const rawVal = ctx.options.getString(optionName) || rawArgs[argIndex];
  if (!rawVal) return null;
  const cleanId = rawVal.replace(/[<@&>]/g, '').trim();
  return (
    ctx.guild.roles.cache.get(cleanId) ||
    ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === rawVal.toLowerCase()) ||
    null
  );
}

export function createAutoRoleCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'autorole',
      category: CommandCategory.UTILITY,
      description: 'Configure automatic join roles for humans and bots, or setup verification roles',
      aliases: ['auto-role', 'joinrole'],
      usage: '/autorole <action> [role] [target] [channel] [message]',
      examples: [
        '/autorole action:show',
        '/autorole action:humans role:@Member',
        '/autorole action:bots role:@Bots',
        '/autorole action:verify role:@Verified',
        '/autorole action:disable target:humans',
        '/autorole action:send-verify channel:#rules message:Click below to gain access!',
        '!autorole show',
        '!autorole humans @Member',
        '!autorole bots @Bots',
        '!autorole verify @Verified',
        '!autorole disable humans',
        '!autorole send-verify',
      ],
      options: [
        {
          name: 'action',
          description: 'AutoRole configuration action',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Show (View current autorole settings)', value: 'show' },
            { name: 'Humans (Set join role for human members)', value: 'humans' },
            { name: 'Bots (Set join role for bot accounts)', value: 'bots' },
            { name: 'Verify (Set verification gateway role)', value: 'verify' },
            { name: 'Disable (Disable a specific autorole type)', value: 'disable' },
            { name: 'Send-Verify (Post an interactive verification button)', value: 'send-verify' },
          ],
        },
        {
          name: 'role',
          description: 'The Discord role to configure',
          type: 'ROLE',
          required: false,
        },
        {
          name: 'target',
          description: 'Which autorole to disable (humans, bots, verify, or all)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Humans', value: 'humans' },
            { name: 'Bots', value: 'bots' },
            { name: 'Bots & Humans', value: 'both' },
            { name: 'Verification Role', value: 'verify' },
            { name: 'All Roles', value: 'all' },
          ],
        },
        {
          name: 'channel',
          description: 'Target channel to post the verification button',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'message',
          description: 'Custom message/description for verification prompt',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId || !ctx.guild) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      if (!hasAdminPermission(ctx)) {
        await ctx.reply({
          content: '❌ You need Administrator or Manage Roles permission to use this command.',
        });
        return;
      }

      const rawArgs = ctx.options.getRawArgs();
      let action = ctx.options.getString('action')?.toLowerCase();
      if (!action) {
        const first = rawArgs[0]?.toLowerCase();
        if (['show', 'humans', 'bots', 'verify', 'disable', 'send-verify', 'sendverify'].includes(first ?? '')) {
          action = first === 'sendverify' ? 'send-verify' : first;
        } else {
          action = 'show';
        }
      }

      // Check bot permission
      if (!services.autoRoleService.hasManageRolesPermission(ctx.guild)) {
        await ctx.reply({
          content: '❌ I do not have the **Manage Roles** permission. Please grant it in Server Settings.',
        });
        return;
      }

      // 1. Show
      if (action === 'show') {
        const config = await services.autoRoleRepo.getGuildAutoRoles(ctx.guildId);
        const embed = new EmbedBuilder()
          .setTitle('⚙️ AutoRole Configuration')
          .setDescription(`Automatic role settings for **${ctx.guild.name}**:`)
          .setColor('#5865F2')
          .setTimestamp();

        const humanRoleText =
          config?.humanRoleIds && config.humanRoleIds.length > 0
            ? config.humanRoleIds.map((id) => `<@&${id}>`).join(', ')
            : '`None`';
        const botRoleText =
          config?.botRoleIds && config.botRoleIds.length > 0
            ? config.botRoleIds.map((id) => `<@&${id}>`).join(', ')
            : '`None`';
        const verifyRoleText = config?.verificationRoleId ? `<@&${config.verificationRoleId}>` : '`None`';
        const isEnabled = config?.isEnabled ?? false;

        embed.addFields(
          { name: 'System Status', value: isEnabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
          { name: 'Human Join Role', value: humanRoleText, inline: true },
          { name: 'Bot Join Role', value: botRoleText, inline: true },
          { name: 'Verification Role', value: verifyRoleText, inline: true },
        );

        embed.setFooter({
          text: 'Configure with: /autorole action:humans role:@Role | /autorole action:verify role:@Role',
        });

        await ctx.reply({ embeds: [embed] });
        return;
      }

      // 2. Set Roles: humans, bots, verify
      if (action === 'humans' || action === 'bots' || action === 'verify') {
        const role = resolveRole(ctx, 'role', 1);
        if (!role) {
          await ctx.reply({
            content: `❌ Please specify a valid role to assign for \`${action}\`.\nUsage: \`/autorole action:${action} role:@Role\``,
          });
          return;
        }

        const validation = services.autoRoleService.isValidAssignableRole(ctx.guild, role.id);
        if (!validation.valid) {
          await ctx.reply({
            content: `❌ Invalid role: ${validation.reason || 'Make sure the role is not `@everyone`, is not managed by an integration, and is positioned below my highest role.'}`,
          });
          return;
        }

        let actionLabel = '';
        if (action === 'humans') {
          await services.autoRoleRepo.setHumanRoleIds(ctx.guildId, [role.id]);
          actionLabel = 'Human Join Role';
        } else if (action === 'bots') {
          await services.autoRoleRepo.setBotRoleIds(ctx.guildId, [role.id]);
          actionLabel = 'Bot Join Role';
        } else if (action === 'verify') {
          await services.autoRoleRepo.setVerificationRole(ctx.guildId, role.id);
          actionLabel = 'Verification Role';
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ AutoRole Updated')
          .setDescription(`Successfully configured **${actionLabel}** to <@&${role.id}> (${role.name}).`)
          .setColor('#00FF00')
          .setTimestamp();

        await ctx.reply({ embeds: [embed] });
        return;
      }

      // 3. Disable
      if (action === 'disable') {
        const target = (ctx.options.getString('target') || rawArgs[1] || 'all').toLowerCase();
        const existing = (await services.autoRoleRepo.getGuildAutoRoles(ctx.guildId)) ?? {
          guildId: ctx.guildId,
          humanRoleIds: [],
          botRoleIds: [],
          verificationRoleId: null,
          verificationChannelId: null,
          verificationMessageId: null,
          isEnabled: true,
        };

        if (target === 'humans') {
          await services.autoRoleRepo.upsertGuildAutoRoles({
            ...existing,
            guildId: ctx.guildId,
            humanRoleIds: [],
          });
        } else if (target === 'bots') {
          await services.autoRoleRepo.upsertGuildAutoRoles({
            ...existing,
            guildId: ctx.guildId,
            botRoleIds: [],
          });
        } else if (target === 'both') {
          await services.autoRoleRepo.upsertGuildAutoRoles({
            ...existing,
            guildId: ctx.guildId,
            humanRoleIds: [],
            botRoleIds: [],
          });
        } else if (target === 'verify') {
          await services.autoRoleRepo.upsertGuildAutoRoles({
            ...existing,
            guildId: ctx.guildId,
            verificationRoleId: null,
          });
        } else {
          // all
          await services.autoRoleRepo.upsertGuildAutoRoles({
            ...existing,
            guildId: ctx.guildId,
            humanRoleIds: [],
            botRoleIds: [],
            verificationRoleId: null,
            isEnabled: false,
          });
        }

        await ctx.reply({
          content: `✅ Successfully disabled autorole setting for \`${target}\`.`,
        });
        return;
      }

      // 4. Send Verification Button Message
      if (action === 'send-verify') {
        const config = await services.autoRoleRepo.getGuildAutoRoles(ctx.guildId);
        if (!config?.verificationRoleId) {
          await ctx.reply({
            content: '❌ No verification role has been set up yet! Please configure one first using `/autorole action:verify role:@Role`.',
          });
          return;
        }

        const channelOpt = await ctx.options.getChannel('channel');
        let targetChannel: TextChannel | null = null;

        if (channelOpt && 'send' in channelOpt) {
          targetChannel = channelOpt as TextChannel;
        } else if (rawArgs[1]) {
          const chId = rawArgs[1].replace(/[<#>]/g, '');
          targetChannel = (ctx.guild.channels.cache.get(chId) as TextChannel) ?? null;
        }

        if (!targetChannel) {
          targetChannel = ctx.channel as TextChannel;
        }

        if (!targetChannel || !('send' in targetChannel)) {
          await ctx.reply({ content: '❌ Could not find a valid text channel to send the verification message.' });
          return;
        }

        const customMessage =
          ctx.options.getString('message') ||
          (rawArgs.slice(2).length > 0 ? rawArgs.slice(2).join(' ') : null) ||
          'Click the button below to verify your account and gain full access to the server!';

        const verifyEmbed = new EmbedBuilder()
          .setTitle('🛡️ Server Verification')
          .setDescription(customMessage)
          .setColor('#5865F2')
          .setFooter({ text: `${ctx.guild.name} Verification Gateway` });

        const verifyBtn = new ButtonBuilder()
          .setCustomId('verify:btn:verify')
          .setLabel('Verify')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(verifyBtn);

        await targetChannel.send({
          embeds: [verifyEmbed],
          components: [row],
        });

        await ctx.reply({
          content: `✅ Verification prompt sent to <#${targetChannel.id}>!`,
        });
      }
    },
  };
}
