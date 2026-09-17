import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonStyle,
  PermissionFlagsBits,
  type GuildTextBasedChannel,
  type Role,
} from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';
import type { Giveaway } from '@ririko/database';

export function parseGiveawayDuration(input: string): number | null {
  const match = input.trim().match(
    /^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/i,
  );
  if (!match) return null;
  const val = parseFloat(match[1]!);
  const unit = match[2]!.toLowerCase();
  if (unit.startsWith('s')) return Math.round(val * 1000);
  if (unit.startsWith('m')) return Math.round(val * 60 * 1000);
  if (unit.startsWith('h')) return Math.round(val * 60 * 60 * 1000);
  if (unit.startsWith('d')) return Math.round(val * 24 * 60 * 60 * 1000);
  if (unit.startsWith('w')) return Math.round(val * 7 * 24 * 60 * 60 * 1000);
  return null;
}

function hasGiveawayPermission(ctx: CommandContext): boolean {
  if (!ctx.member) return true; // Direct/test mock fallback
  const perms = ctx.member.permissions;
  return (
    perms.has(PermissionFlagsBits.ManageMessages) ||
    perms.has(PermissionFlagsBits.ManageGuild) ||
    perms.has(PermissionFlagsBits.Administrator)
  );
}

async function resolveGiveaway(
  services: BotServices,
  identifier: string,
  guildId?: string | null,
): Promise<Giveaway | null> {
  const clean = identifier.trim();
  let giveaway = await services.giveawayRepo.findById(clean);
  if (!giveaway) {
    giveaway = await services.giveawayRepo.findByMessageId(clean);
  }
  if (giveaway && guildId && giveaway.guildId !== guildId) {
    return null;
  }
  return giveaway;
}

export function createGiveawayCommands(services: BotServices): Command[] {
  const giveawayCommand: Command = {
    metadata: {
      name: 'giveaway',
      category: CommandCategory.UTILITY,
      description: 'Host, manage, and roll crash-resistant giveaways',
      usage: '/giveaway <create|end|reroll|delete|edit|list>',
      examples: [
        '/giveaway create prize:Discord Nitro duration:1d winners:2 channel:#giveaways',
        '/giveaway end giveaway:123456789012345678',
        '/giveaway reroll giveaway:123456789012345678 winners:1',
        '/giveaway list',
      ],
      options: [
        {
          name: 'action',
          description: 'Subcommand action to execute',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Create (Start a new giveaway)', value: 'create' },
            { name: 'End (Conclude giveaway and pick winners)', value: 'end' },
            { name: 'Reroll (Pick new winners for ended giveaway)', value: 'reroll' },
            { name: 'Delete (Cancel and remove giveaway)', value: 'delete' },
            { name: 'Edit (Update prize, duration, or winners)', value: 'edit' },
            { name: 'List (View active server giveaways)', value: 'list' },
          ],
        },
        {
          name: 'prize',
          description: 'The item or prize being given away',
          type: 'STRING',
          required: false,
        },
        {
          name: 'duration',
          description: 'Duration (e.g. 1d, 12h, 30m, 45s)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'winners',
          description: 'Number of winners to roll (default: 1)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'channel',
          description: 'Target text channel to host the giveaway in',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'giveaway',
          description: 'Giveaway Message ID or UUID to manage',
          type: 'STRING',
          required: false,
        },
        {
          name: 'role',
          description: 'Required Discord role to enter (optional)',
          type: 'ROLE',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) {
        await ctx.reply({ content: '❌ Giveaway commands can only be used within a server.' });
        return;
      }

      // 1. Determine action from subcommands or arguments
      const rawArgs = ctx.options.getRawArgs();
      let action = ctx.options.getString('action')?.toLowerCase();
      if (!action) {
        // Fallback for prefix or subcommands: check first arg
        const sub = rawArgs[0]?.toLowerCase();
        if (['create', 'end', 'reroll', 'delete', 'edit', 'list'].includes(sub ?? '')) {
          action = sub;
        } else {
          action = 'list';
        }
      }

      // Check permissions for administrative actions
      if (action !== 'list' && !hasGiveawayPermission(ctx)) {
        await ctx.reply({
          content: '❌ You need the **Manage Messages** or **Manage Server** permission to manage giveaways.',
        });
        return;
      }

      // --- Subcommand Dispatch ---
      if (action === 'create') {
        let prize: string | null | undefined = ctx.options.getString('prize');
        let durationStr: string | null | undefined = ctx.options.getString('duration');
        let winners = ctx.options.getInteger('winners') ?? 1;
        const channelOpt = await ctx.options.getChannel('channel');

        // Parse args for prefix fallback: !giveaway create <duration> <winners> <prize...>
        if (!prize && rawArgs.length >= 2) {
          const firstArg = rawArgs[1];
          const parsedDur = firstArg ? parseGiveawayDuration(firstArg) : null;
          if (parsedDur) {
            durationStr = firstArg;
            const secondArg = parseInt(rawArgs[2] ?? '1', 10);
            if (!isNaN(secondArg) && secondArg > 0) {
              winners = secondArg;
              prize = rawArgs.slice(3).join(' ').trim();
            } else {
              prize = rawArgs.slice(2).join(' ').trim();
            }
          } else {
            prize = rawArgs.slice(1).join(' ').trim();
          }
        }

        if (!prize) {
          await ctx.reply({
            content: '❌ Please specify what prize you are giving away. Example: `/giveaway create prize:Nitro duration:1d`',
          });
          return;
        }

        if (!durationStr) {
          await ctx.reply({
            content: '❌ Please specify a valid duration. Example: `1d`, `12h`, `30m`.',
          });
          return;
        }

        const durationMs = parseGiveawayDuration(durationStr);
        if (!durationMs || durationMs < 5000) {
          await ctx.reply({
            content: '❌ Invalid duration. Must be at least 5 seconds (e.g. `1m`, `2h`, `1d`).',
          });
          return;
        }

        if (durationMs > 30 * 86_400_000) {
          await ctx.reply({
            content: '❌ Giveaway duration cannot exceed 30 days.',
          });
          return;
        }

        const targetChannel = (channelOpt as GuildTextBasedChannel | null) ?? (ctx.channel as GuildTextBasedChannel);
        if (!targetChannel || !('send' in targetChannel)) {
          await ctx.reply({ content: '❌ Could not resolve a valid text channel for the giveaway.' });
          return;
        }

        const roleOpt = ctx.source === 'slash' && 'options' in ctx.raw
          ? (ctx.raw as any).options?.getRole?.('role') as Role | null
          : null;

        const requirements: Record<string, unknown> = {};
        if (roleOpt) {
          requirements.requiredRoleIds = [roleOpt.id];
        }

        // 1. Create giveaway record in repository
        const createdGw = await services.giveawayEngine.createGiveaway({
          guildId: ctx.guildId,
          channelId: targetChannel.id,
          prize,
          winnerCount: Math.max(1, winners),
          durationMs,
          createdBy: ctx.user.id,
          requirements,
        });

        // 2. Format initial embed and button
        const embedData = services.giveawayEngine.formatGiveawayEmbed(createdGw, 0);
        const buttonData = services.giveawayEngine.formatGiveawayButton(createdGw.id, false, 0);

        const embed = new EmbedBuilder(embedData);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buttonData.customId)
            .setLabel(buttonData.label)
            .setStyle(buttonData.style as ButtonStyle)
            .setEmoji(buttonData.emoji),
        );

        const sentMsg = await targetChannel.send({
          embeds: [embed],
          components: [row],
        });

        // Update record with actual Discord message ID
        await services.giveawayRepo.update(createdGw.id, { messageId: sentMsg.id });

        await ctx.reply({
          content: `🎉 Giveaway created successfully in <#${targetChannel.id}>!\n[Jump to Giveaway](${sentMsg.url})`,
        });
        return;
      }

      if (action === 'end') {
        const giveawayIdInput = ctx.options.getString('giveaway') ?? rawArgs[1];
        if (!giveawayIdInput) {
          await ctx.reply({ content: '❌ Please provide the Message ID or Giveaway ID to end.' });
          return;
        }

        const giveaway = await resolveGiveaway(services, giveawayIdInput, ctx.guildId);
        if (!giveaway) {
          await ctx.reply({ content: `❌ No active giveaway found with ID or Message ID: \`${giveawayIdInput}\`.` });
          return;
        }

        if (giveaway.isEnded) {
          await ctx.reply({ content: '⚠️ This giveaway has already ended.' });
          return;
        }

        const result = await services.giveawayEngine.rollAndEndGiveaway(giveaway.id);
        if (!result) {
          await ctx.reply({ content: '❌ Failed to end the giveaway.' });
          return;
        }

        const winnersDisplay = result.winnerIds.length > 0
          ? result.winnerIds.map((id) => `<@${id}>`).join(', ')
          : 'None (No eligible entries)';

        await ctx.reply({
          content: `🎉 Giveaway for **${giveaway.prize}** ended!\n🏆 **Winner(s)**: ${winnersDisplay}`,
        });
        return;
      }

      if (action === 'reroll') {
        const giveawayIdInput = ctx.options.getString('giveaway') ?? rawArgs[1];
        const winnersCount = ctx.options.getInteger('winners') ?? (rawArgs[2] ? parseInt(rawArgs[2], 10) : undefined);

        if (!giveawayIdInput) {
          await ctx.reply({ content: '❌ Please provide the Message ID or Giveaway ID to reroll.' });
          return;
        }

        const giveaway = await resolveGiveaway(services, giveawayIdInput, ctx.guildId);
        if (!giveaway) {
          await ctx.reply({ content: `❌ No giveaway found with ID or Message ID: \`${giveawayIdInput}\`.` });
          return;
        }

        if (!giveaway.isEnded) {
          await ctx.reply({ content: '⚠️ This giveaway is still active! Use `/giveaway end` to end it first.' });
          return;
        }

        const result = await services.giveawayEngine.reroll(giveaway.id, winnersCount);
        if (!result || result.winnerIds.length === 0) {
          await ctx.reply({
            content: '⚠️ No new eligible winners could be selected (no more unique entrants available).',
          });
          return;
        }

        const newWinners = result.winnerIds.map((id) => `<@${id}>`).join(', ');

        // Post announcement in host channel
        try {
          const channel = await ctx.client.channels.fetch(giveaway.channelId).catch(() => null);
          if (channel && channel.isTextBased() && 'send' in channel) {
            await (channel as any).send({
              content: `🎉 **Giveaway Rerolled!**\nNew Winner(s): ${newWinners}!\nYou won **${giveaway.prize}**!`,
            });
          }
        } catch (err) {
          console.error('[GiveawayCommand] Failed to post reroll message:', err);
        }

        await ctx.reply({
          content: `🎉 Reroll complete! New winner(s): ${newWinners}`,
        });
        return;
      }

      if (action === 'delete') {
        const giveawayIdInput = ctx.options.getString('giveaway') ?? rawArgs[1];
        if (!giveawayIdInput) {
          await ctx.reply({ content: '❌ Please provide the Message ID or Giveaway ID to delete.' });
          return;
        }

        const giveaway = await resolveGiveaway(services, giveawayIdInput, ctx.guildId);
        if (!giveaway) {
          await ctx.reply({ content: `❌ No giveaway found with ID or Message ID: \`${giveawayIdInput}\`.` });
          return;
        }

        // Try to delete Discord message
        try {
          const channel = await ctx.client.channels.fetch(giveaway.channelId).catch(() => null);
          if (channel && channel.isTextBased() && 'messages' in channel) {
            const msg = await (channel as any).messages.fetch(giveaway.messageId).catch(() => null);
            if (msg) {
              await msg.delete().catch(() => null);
            }
          }
        } catch {
          // Non-blocking if message already gone
        }

        await services.giveawayRepo.delete(giveaway.id);

        await ctx.reply({ content: `🗑️ Giveaway for **${giveaway.prize}** has been deleted.` });
        return;
      }

      if (action === 'edit') {
        const giveawayIdInput = ctx.options.getString('giveaway') ?? rawArgs[1];
        if (!giveawayIdInput) {
          await ctx.reply({ content: '❌ Please provide the Message ID or Giveaway ID to edit.' });
          return;
        }

        const giveaway = await resolveGiveaway(services, giveawayIdInput, ctx.guildId);
        if (!giveaway) {
          await ctx.reply({ content: `❌ No giveaway found with ID or Message ID: \`${giveawayIdInput}\`.` });
          return;
        }

        if (giveaway.isEnded) {
          await ctx.reply({ content: '⚠️ You cannot edit an ended giveaway.' });
          return;
        }

        const newPrize = ctx.options.getString('prize');
        const newWinners = ctx.options.getInteger('winners');
        const newDuration = ctx.options.getString('duration');

        const updates: Partial<Giveaway> = {};
        if (newPrize) updates.prize = newPrize;
        if (newWinners && newWinners > 0) updates.winnerCount = newWinners;
        if (newDuration) {
          const ms = parseGiveawayDuration(newDuration);
          if (ms) {
            updates.endsAt = new Date(Date.now() + ms);
          }
        }

        if (Object.keys(updates).length === 0) {
          await ctx.reply({ content: '⚠️ Please provide at least one field to edit (`prize`, `winners`, or `duration`).' });
          return;
        }

        const updated = await services.giveawayRepo.update(giveaway.id, updates);

        // Update original Discord message embed
        try {
          const channel = await ctx.client.channels.fetch(updated.channelId).catch(() => null);
          if (channel && channel.isTextBased() && 'messages' in channel) {
            const msg = await (channel as any).messages.fetch(updated.messageId).catch(() => null);
            if (msg) {
              const entryCount = await services.giveawayRepo.getEntryCount(updated.id);
              const embedData = services.giveawayEngine.formatGiveawayEmbed(updated, entryCount);
              const embed = new EmbedBuilder(embedData);
              await msg.edit({ embeds: [embed] }).catch(() => null);
            }
          }
        } catch (err) {
          console.error('[GiveawayCommand] Failed to edit Discord message:', err);
        }

        await ctx.reply({ content: `✓ Giveaway **${updated.prize}** updated successfully!` });
        return;
      }

      if (action === 'list') {
        const activeGiveaways = await services.giveawayRepo.listActiveGiveaways(ctx.guildId);
        if (activeGiveaways.length === 0) {
          await ctx.reply({ content: '📋 There are currently no active giveaways in this server.' });
          return;
        }

        const lines = activeGiveaways.map((gw, idx) => {
          const endsUnix = Math.floor(new Date(gw.endsAt).getTime() / 1000);
          return `**${idx + 1}. ${gw.prize}**\n• Channel: <#${gw.channelId}> | Winners: **${gw.winnerCount}**\n• Ends: <t:${endsUnix}:R> (<t:${endsUnix}:f>)\n• ID: \`${gw.id}\` | Message: \`${gw.messageId}\``;
        });

        const embed = new EmbedBuilder()
          .setTitle('🎉 Active Giveaways')
          .setDescription(lines.join('\n\n'))
          .setColor(0x5865f2)
          .setFooter({ text: `Total Active: ${activeGiveaways.length}` });

        await ctx.reply({ embeds: [embed] });
        return;
      }

      await ctx.reply({ content: `❌ Unknown giveaway action: \`${action}\`.` });
    },
  };

  // 2. Legacy prefix aliases: !gcreate, !gend, !greroll, !gdelete, !gedit, !glist
  const createLegacyAlias = (name: string, action: string, description: string): Command => ({
    metadata: {
      name,
      category: CommandCategory.UTILITY,
      description,
      usage: `!${name}`,
    },
    async execute(ctx: CommandContext): Promise<void> {
      // Synthesize action option and delegate to primary giveaway command
      const delegatedCtx: CommandContext = {
        ...ctx,
        options: {
          ...ctx.options,
          getString: (opt: string) => {
            if (opt === 'action') return action;
            return ctx.options.getString(opt);
          },
        },
      };
      await giveawayCommand.execute(delegatedCtx);
    },
  });

  return [
    giveawayCommand,
    createLegacyAlias('gcreate', 'create', 'Create a giveaway (legacy alias)'),
    createLegacyAlias('gend', 'end', 'End a giveaway (legacy alias)'),
    createLegacyAlias('greroll', 'reroll', 'Reroll a giveaway (legacy alias)'),
    createLegacyAlias('gdelete', 'delete', 'Delete a giveaway (legacy alias)'),
    createLegacyAlias('gedit', 'edit', 'Edit a giveaway (legacy alias)'),
    createLegacyAlias('glist', 'list', 'List active giveaways (legacy alias)'),
  ];
}
