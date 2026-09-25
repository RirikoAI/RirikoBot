import {
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type GuildTextBasedChannel,
} from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import type { FreeGameItem } from '@ririko/services';

/**
 * Creates the complete Free Games dual-dispatch command suite.
 */
export function createFreeGamesCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'freegames',
      category: CommandCategory.GENERAL,
      description: 'Check active free game promotions from Epic Games Store and Steam',
      aliases: ['free-games', 'freegame'],
      usage: '/freegames [action] [channel]',
      examples: [
        '/freegames',
        '/freegames action:show',
        '/freegames action:setchannel channel:#free-games',
        '/freegames action:remove',
        '!freegames',
        '!freegames setchannel #free-games',
        '!freegames remove',
      ],
      options: [
        {
          name: 'action',
          description: 'Subcommand action to execute',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Show (View Current Free Games)', value: 'show' },
            { name: 'Set Channel (Configure Alert Channel)', value: 'setchannel' },
            { name: 'Remove (Disable Server Alerts)', value: 'remove' },
          ],
        },
        {
          name: 'channel',
          description: 'Channel to send free game announcements to',
          type: 'CHANNEL',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      let action = ctx.options.getString('action')?.toLowerCase().trim();
      const rawArgs = ctx.options.getRawArgs();

      if (!action && rawArgs.length > 0) {
        const first = rawArgs[0]!.toLowerCase();
        if (['show', 'list', 'setchannel', 'channel', 'remove', 'disable'].includes(first)) {
          if (['setchannel', 'channel'].includes(first)) action = 'setchannel';
          else if (['remove', 'disable'].includes(first)) action = 'remove';
          else action = 'show';
        }
      }

      if (action === 'setchannel') {
        await handleSetChannel(ctx, services);
        return;
      }

      if (action === 'remove') {
        await handleRemoveChannel(ctx, services);
        return;
      }

      // Default: show current free games
      await handleShowFreeGames(ctx, services);
    },
  };
}

async function handleShowFreeGames(ctx: CommandContext, services: BotServices): Promise<void> {
  await ctx.deferReply();

  try {
    const games: FreeGameItem[] = await services.freeGamesEngine.pollFreeGames();
    const activeGames = games.filter((g) => !g.isUpcoming);
    const upcomingGames = games.filter((g) => g.isUpcoming);

    if (activeGames.length === 0 && upcomingGames.length === 0) {
      await ctx.editReply({
        content:
          '🎮 **No Free Games Found Right Now.**\nCheck back soon or set up alerts with `/freegames setchannel` to be notified immediately when a new free game drops!',
      });
      return;
    }

    let configuredChannel: string | null = null;
    if (ctx.guildId) {
      configuredChannel = await services.freeGameRepo.getGuildChannel(ctx.guildId);
    }

    const embeds: EmbedBuilder[] = [];

    // Header Embed
    const headerEmbed = new EmbedBuilder()
      .setTitle('🎮 Free Games Promos (Epic Games Store & Steam)')
      .setColor(0x0078f2)
      .setDescription(
        `Currently available 100% free-to-keep promotional games!\n${
          configuredChannel
            ? `🔔 Auto-alerts are enabled in <#${configuredChannel}>.`
            : '💡 Tip: Run `/freegames setchannel` to get automatic alerts when new free games drop.'
        }`,
      )
      .setFooter({ text: 'Ririko AI Free Games Feed' })
      .setTimestamp();

    embeds.push(headerEmbed);

    // Active games embeds (up to 4 embeds to respect Discord 10-embed response limit)
    for (const game of activeGames.slice(0, 4)) {
      const embedData = services.freeGamesEngine.formatGameEmbed(game);
      const embed = new EmbedBuilder()
        .setTitle(embedData.title)
        .setURL(embedData.url)
        .setDescription(embedData.description)
        .setColor(embedData.color);

      if (embedData.thumbnail?.url) {
        embed.setThumbnail(embedData.thumbnail.url);
      }
      if (embedData.image?.url) {
        embed.setImage(embedData.image.url);
      }
      if (embedData.footer) {
        embed.setFooter(embedData.footer);
      }

      embeds.push(embed);
    }

    // If upcoming games exist, summarize in an embed
    if (upcomingGames.length > 0) {
      const upcomingEmbed = new EmbedBuilder()
        .setTitle('⏳ Coming Soon (Upcoming Free Games)')
        .setColor(0xf39c12);

      const lines = upcomingGames.map((g) => {
        const startTs = Math.floor(g.startDate.getTime() / 1000);
        return `• **[${g.title}](${g.storeUrl})** (${g.provider}) — Starts <t:${startTs}:R>`;
      });

      upcomingEmbed.setDescription(lines.join('\n'));
      embeds.push(upcomingEmbed);
    }

    // Action button row for first active game if available
    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    if (activeGames[0]) {
      const button = new ButtonBuilder()
        .setLabel(`Claim ${activeGames[0].title.slice(0, 50)}`)
        .setStyle(ButtonStyle.Link)
        .setURL(activeGames[0].storeUrl);

      components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(button));
    }

    await ctx.editReply({
      embeds,
      components,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.editReply({ content: `❌ Error fetching free games: ${message}` });
  }
}

async function handleSetChannel(ctx: CommandContext, services: BotServices): Promise<void> {
  if (!ctx.guildId) {
    await ctx.reply({
      content: '❌ Free games announcement channel can only be configured in a server.',
      ephemeral: true,
    });
    return;
  }

  const canManage =
    ctx.member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
    ctx.member?.permissions.has(PermissionFlagsBits.Administrator);

  if (!canManage) {
    await ctx.reply({
      content:
        '❌ You require **Manage Server** permissions to configure free game alert channels.',
      ephemeral: true,
    });
    return;
  }

  const targetChannel =
    ((await ctx.options.getChannel('channel')) as GuildTextBasedChannel | null) ??
    (ctx.channel as GuildTextBasedChannel | null);

  if (!targetChannel) {
    await ctx.reply({
      content:
        '❌ Please specify or mention a valid text channel.\nExample: `/freegames setchannel channel:#free-games` or `!freegames setchannel #free-games`',
      ephemeral: true,
    });
    return;
  }

  await ctx.deferReply();

  try {
    await services.freeGameRepo.setGuildChannel(ctx.guildId, targetChannel.id);

    const embed = new EmbedBuilder()
      .setTitle('✅ Free Games Channel Configured')
      .setColor(0x00ff7f)
      .setDescription(
        `All future free game drops from **Epic Games Store** and **Steam** will automatically be announced in <#${targetChannel.id}>!`,
      )
      .addFields(
        { name: '📢 Channel', value: `<#${targetChannel.id}>`, inline: true },
        { name: '🎮 Supported Stores', value: 'Epic Games Store, Steam', inline: true },
      )
      .setFooter({ text: 'Ririko AI Free Games Announcer' })
      .setTimestamp();

    await ctx.editReply({ embeds: [embed] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.editReply({ content: `❌ Failed to configure free games channel: ${message}` });
  }
}

async function handleRemoveChannel(ctx: CommandContext, services: BotServices): Promise<void> {
  if (!ctx.guildId) {
    await ctx.reply({
      content: '❌ Free games alert settings can only be managed in a server.',
      ephemeral: true,
    });
    return;
  }

  const canManage =
    ctx.member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
    ctx.member?.permissions.has(PermissionFlagsBits.Administrator);

  if (!canManage) {
    await ctx.reply({
      content: '❌ You require **Manage Server** permissions to remove free game alert channels.',
      ephemeral: true,
    });
    return;
  }

  await ctx.deferReply();

  try {
    const removed = await services.freeGameRepo.removeGuildChannel(ctx.guildId);

    if (!removed) {
      await ctx.editReply({
        content: 'ℹ️ No free games alert channel was configured for this server.',
      });
      return;
    }

    await ctx.editReply({
      content:
        '✅ **Free Games Alerts Disabled!**\nAutomatic announcements for free games on Epic Games Store and Steam have been removed.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.editReply({ content: `❌ Error removing configuration: ${message}` });
  }
}
