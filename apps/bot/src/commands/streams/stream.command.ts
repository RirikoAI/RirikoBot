import {
  EmbedBuilder,
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
import type { StreamPlatform } from '@ririko/services';

const PLATFORM_CHOICES = [
  { name: 'Twitch', value: 'TWITCH' },
  { name: 'YouTube Live', value: 'YOUTUBE' },
  { name: 'TikTok Live', value: 'TIKTOK' },
];

function inferPlatform(input: string, explicitPlatform?: string | null): StreamPlatform {
  if (explicitPlatform && ['TWITCH', 'YOUTUBE', 'TIKTOK'].includes(explicitPlatform.toUpperCase())) {
    return explicitPlatform.toUpperCase() as StreamPlatform;
  }

  const lower = input.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    return 'YOUTUBE';
  }
  if (lower.includes('tiktok.com')) {
    return 'TIKTOK';
  }
  if (lower.includes('twitch.tv')) {
    return 'TWITCH';
  }

  return 'TWITCH';
}

function cleanStreamerIdentifier(input: string): string {
  let clean = input.trim();
  clean = clean.replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '');
  clean = clean.replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, '');
  clean = clean.replace(/^https?:\/\/(www\.)?youtube\.com\/(@|channel\/)?/i, '');
  clean = clean.replace(/^@/, '');
  clean = clean.split('/')[0]!;
  clean = clean.split('?')[0]!;
  return clean.trim();
}

/**
 * Creates the complete Stream alerts dual-dispatch command suite.
 */
export function createStreamCommands(services: BotServices): Command[] {
  // 1. Primary /stream command with subcommands
  const streamCommand: Command = {
    metadata: {
      name: 'stream',
      category: CommandCategory.UTILITY,
      description: 'Configure and monitor live stream alerts (Twitch, YouTube, TikTok)',
      usage: '/stream <subscribe|unsubscribe|list|channel>',
      examples: [
        '/stream subscribe streamer:shroud platform:Twitch channel:#streams',
        '/stream unsubscribe streamer:shroud',
        '/stream list',
        '/stream channel channel:#announcements',
      ],
      options: [
        {
          name: 'action',
          description: 'Subcommand action to execute',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Subscribe (Add Streamer Alert)', value: 'subscribe' },
            { name: 'Unsubscribe (Remove Streamer Alert)', value: 'unsubscribe' },
            { name: 'List (View Subscribed Streamers)', value: 'list' },
            { name: 'Channel (Set Default Stream Channel)', value: 'channel' },
          ],
        },
        {
          name: 'streamer',
          description: 'Streamer username, handle, or profile URL',
          type: 'STRING',
          required: false,
        },
        {
          name: 'platform',
          description: 'Streaming platform (Twitch, YouTube, TikTok)',
          type: 'STRING',
          required: false,
          choices: PLATFORM_CHOICES,
        },
        {
          name: 'channel',
          description: 'Text channel to post live announcements in',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'role',
          description: 'Role to mention when stream goes live',
          type: 'ROLE',
          required: false,
        },
        {
          name: 'custom_message',
          description: 'Custom message template (Variables: {streamer}, {title}, {game}, {url}, {role})',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      let action = ctx.options.getString('action')?.toLowerCase().trim();
      const rawArgs = ctx.options.getRawArgs();

      if (!action && rawArgs.length > 0) {
        const first = rawArgs[0]!.toLowerCase();
        if (['subscribe', 'sub', 'add', 'unsubscribe', 'unsub', 'remove', 'list', 'status', 'channel', 'setchannel'].includes(first)) {
          if (['sub', 'add'].includes(first)) action = 'subscribe';
          else if (['unsub', 'remove'].includes(first)) action = 'unsubscribe';
          else if (['status'].includes(first)) action = 'list';
          else if (['setchannel'].includes(first)) action = 'channel';
          else action = first;
        }
      }

      if (!action || action === 'list') {
        await handleListStreams(ctx, services);
        return;
      }

      if (action === 'subscribe') {
        await handleSubscribeStream(ctx, services);
        return;
      }

      if (action === 'unsubscribe') {
        await handleUnsubscribeStream(ctx, services);
        return;
      }

      if (action === 'channel') {
        await handleSetStreamChannel(ctx, services);
        return;
      }

      await ctx.reply({
        content: '❓ Unknown stream subcommand. Use `/stream subscribe`, `/stream unsubscribe`, `/stream list`, or `/stream channel`.',
        ephemeral: true,
      });
    },
  };

  // 2. Legacy alias: !subscribe <streamer> [platform]
  const legacySubscribeCommand: Command = {
    metadata: {
      name: 'subscribe',
      category: CommandCategory.UTILITY,
      description: 'Subscribe this server to live alerts for a streamer',
      aliases: ['sub'],
      usage: '!subscribe <streamer> [platform]',
      examples: ['!subscribe shroud', '!subscribe shroud twitch', '!subscribe @MrBeast youtube'],
    },
    async execute(ctx: CommandContext): Promise<void> {
      await handleSubscribeStream(ctx, services);
    },
  };

  // 3. Legacy alias: !unsubscribe <streamer>
  const legacyUnsubscribeCommand: Command = {
    metadata: {
      name: 'unsubscribe',
      category: CommandCategory.UTILITY,
      description: 'Unsubscribe this server from live alerts for a streamer',
      aliases: ['unsub'],
      usage: '!unsubscribe <streamer>',
      examples: ['!unsubscribe shroud'],
    },
    async execute(ctx: CommandContext): Promise<void> {
      await handleUnsubscribeStream(ctx, services);
    },
  };

  // 4. Legacy alias: !setup-twitch <#channel>
  const legacySetupTwitchCommand: Command = {
    metadata: {
      name: 'setup-twitch',
      category: CommandCategory.UTILITY,
      description: 'Set default channel for stream live announcements',
      usage: '!setup-twitch <#channel>',
      examples: ['!setup-twitch #live-streams'],
    },
    async execute(ctx: CommandContext): Promise<void> {
      await handleSetStreamChannel(ctx, services);
    },
  };

  // 5. Legacy alias: !twitch-status
  const legacyTwitchStatusCommand: Command = {
    metadata: {
      name: 'twitch-status',
      category: CommandCategory.UTILITY,
      description: 'List all currently monitored streamers and their live status',
      aliases: ['stream-status', 'streamstatus'],
      usage: '!twitch-status',
      examples: ['!twitch-status'],
    },
    async execute(ctx: CommandContext): Promise<void> {
      await handleListStreams(ctx, services);
    },
  };

  return [
    streamCommand,
    legacySubscribeCommand,
    legacyUnsubscribeCommand,
    legacySetupTwitchCommand,
    legacyTwitchStatusCommand,
  ];
}

async function handleSubscribeStream(ctx: CommandContext, services: BotServices): Promise<void> {
  if (!ctx.guildId) {
    await ctx.reply({ content: '❌ Stream alerts can only be configured inside a Discord server.', ephemeral: true });
    return;
  }

  const canManage =
    ctx.member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
    ctx.member?.permissions.has(PermissionFlagsBits.Administrator);

  if (!canManage) {
    await ctx.reply({
      content: '❌ You require **Manage Server** permissions to configure stream alert subscriptions.',
      ephemeral: true,
    });
    return;
  }

  const rawArgs = ctx.options.getRawArgs();
  let streamerInput = ctx.options.getString('streamer');
  let platformInput = ctx.options.getString('platform');
  const targetChannel =
    ((await ctx.options.getChannel('channel')) as GuildTextBasedChannel | null) ??
    (ctx.channel as GuildTextBasedChannel | null);
  const mentionRole =
    ctx.source === 'slash' && 'options' in ctx.raw
      ? ((ctx.raw as any).options?.getRole?.('role') as Role | null)
      : null;
  const customMessage = ctx.options.getString('custom_message');

  // Prefix argument fallback: !subscribe <streamer> [platform]
  if (!streamerInput && rawArgs.length > 0) {
    // If first arg was "subscribe" subcommand
    const offset = ['subscribe', 'sub', 'add'].includes(rawArgs[0]!.toLowerCase()) ? 1 : 0;
    streamerInput = rawArgs[offset] ?? null;
    if (rawArgs[offset + 1]) {
      const maybePlatform = rawArgs[offset + 1]!.toUpperCase();
      if (['TWITCH', 'YOUTUBE', 'TIKTOK'].includes(maybePlatform)) {
        platformInput = maybePlatform;
      }
    }
  }

  if (!streamerInput) {
    await ctx.reply({
      content: '❌ Please provide a streamer username, channel name, or profile URL.\nExample: `/stream subscribe streamer:shroud` or `!subscribe shroud`',
      ephemeral: true,
    });
    return;
  }

  const platform = inferPlatform(streamerInput, platformInput);
  const identifier = cleanStreamerIdentifier(streamerInput);

  await ctx.deferReply();

  try {
    const adapter = services.streamWatcher.getAdapter(platform);
    let displayName = identifier;
    let avatarUrl: string | null = null;
    let platformUserId = identifier.toLowerCase();

    if (adapter) {
      const profile = await adapter.resolveStreamer(identifier).catch(() => null);
      if (profile) {
        platformUserId = profile.platformUserId;
        displayName = profile.displayName || profile.username;
        avatarUrl = profile.avatarUrl;
      }
    }

    const streamerId = `${platform.toLowerCase()}_${platformUserId}`;

    // 1. Upsert streamer in database
    const streamer = await services.streamRepo.upsertStreamer({
      id: streamerId,
      platform,
      platformUserId,
      username: identifier.toLowerCase(),
      displayName,
      avatarUrl,
      isLive: false,
      lastCheckedAt: new Date(),
    });

    // 2. Add subscription
    const channelId = targetChannel?.id || ctx.channelId;
    const subscriptionId = `sub_${ctx.guildId}_${streamer.id}`;

    await services.streamRepo.addSubscription({
      id: subscriptionId,
      streamerId: streamer.id,
      guildId: ctx.guildId,
      channelId,
      mentionRoleId: mentionRole?.id ?? null,
      customMessage: customMessage || null,
    });

    const embed = new EmbedBuilder()
      .setTitle('🔴 Streamer Alert Added')
      .setColor(platform === 'TWITCH' ? 0x9146ff : platform === 'YOUTUBE' ? 0xff0000 : 0x00f2fe)
      .setDescription(
        `Subscribed server to live announcements for **${displayName}** on **${platform}**!`,
      )
      .addFields(
        { name: '📺 Streamer', value: `\`${displayName}\``, inline: true },
        { name: '🌐 Platform', value: platform, inline: true },
        { name: '📢 Alerts Channel', value: `<#${channelId}>`, inline: true },
      )
      .setThumbnail(avatarUrl ?? null)
      .setFooter({ text: 'Ririko AI Stream Watcher' })
      .setTimestamp();

    if (mentionRole) {
      embed.addFields({ name: '🔔 Mention Role', value: `<@&${mentionRole.id}>`, inline: true });
    }

    await ctx.editReply({ embeds: [embed] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.editReply({ content: `❌ Failed to subscribe to streamer: ${message}` });
  }
}

async function handleUnsubscribeStream(ctx: CommandContext, services: BotServices): Promise<void> {
  if (!ctx.guildId) {
    await ctx.reply({ content: '❌ Stream alerts can only be configured inside a Discord server.', ephemeral: true });
    return;
  }

  const canManage =
    ctx.member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
    ctx.member?.permissions.has(PermissionFlagsBits.Administrator);

  if (!canManage) {
    await ctx.reply({
      content: '❌ You require **Manage Server** permissions to remove stream alert subscriptions.',
      ephemeral: true,
    });
    return;
  }

  const rawArgs = ctx.options.getRawArgs();
  let streamerInput = ctx.options.getString('streamer');
  const platformInput = ctx.options.getString('platform');

  if (!streamerInput && rawArgs.length > 0) {
    const offset = ['unsubscribe', 'unsub', 'remove'].includes(rawArgs[0]!.toLowerCase()) ? 1 : 0;
    streamerInput = rawArgs[offset] ?? null;
  }

  if (!streamerInput) {
    await ctx.reply({
      content: '❌ Please provide the streamer username to unsubscribe from.\nExample: `/stream unsubscribe streamer:shroud` or `!unsubscribe shroud`',
      ephemeral: true,
    });
    return;
  }

  const platform = inferPlatform(streamerInput, platformInput);
  const identifier = cleanStreamerIdentifier(streamerInput);

  await ctx.deferReply();

  try {
    const streamer = await services.streamRepo.findByUsername(platform, identifier);
    if (!streamer) {
      await ctx.editReply({
        content: `❌ No active streamer subscription found for \`${identifier}\` on **${platform}**.`,
      });
      return;
    }

    const removed = await services.streamRepo.removeSubscription(ctx.guildId, streamer.id);
    if (!removed) {
      await ctx.editReply({
        content: `❌ Streamer **${streamer.displayName || streamer.username}** was not subscribed in this server.`,
      });
      return;
    }

    await ctx.editReply({
      content: `✅ Successfully unsubscribed from live alerts for **${streamer.displayName || streamer.username}** on **${streamer.platform}**.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.editReply({ content: `❌ Error unsubscribing: ${message}` });
  }
}

async function handleListStreams(ctx: CommandContext, services: BotServices): Promise<void> {
  if (!ctx.guildId) {
    await ctx.reply({ content: '❌ Stream alerts can only be viewed inside a Discord server.', ephemeral: true });
    return;
  }

  await ctx.deferReply();

  try {
    const subscriptions = await services.streamRepo.getSubscriptionsByGuild(ctx.guildId);

    if (subscriptions.length === 0) {
      await ctx.editReply({
        content: '📡 **No active stream subscriptions in this server.**\nUse `/stream subscribe` or `!subscribe <streamer>` to set up alerts!',
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📡 Subscribed Streamers')
      .setColor(0x5865f2)
      .setDescription(`This server is currently monitoring **${subscriptions.length}** streamer(s):`)
      .setFooter({ text: 'Ririko AI Stream Watcher' })
      .setTimestamp();

    for (const sub of subscriptions) {
      const streamer = await services.streamRepo.findById(sub.streamerId);
      if (!streamer) continue;

      const liveStatus = streamer.isLive ? '🟢 **LIVE**' : '⚫ *Offline*';
      const channelMention = `<#${sub.channelId}>`;
      const roleMention = sub.mentionRoleId ? `• Role: <@&${sub.mentionRoleId}>` : '';

      embed.addFields({
        name: `${streamer.displayName || streamer.username} (${streamer.platform})`,
        value: `Status: ${liveStatus}\nChannel: ${channelMention} ${roleMention}`,
        inline: false,
      });
    }

    await ctx.editReply({ embeds: [embed] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.editReply({ content: `❌ Error listing subscriptions: ${message}` });
  }
}

async function handleSetStreamChannel(ctx: CommandContext, services: BotServices): Promise<void> {
  if (!ctx.guildId) {
    await ctx.reply({ content: '❌ Stream alert channel can only be configured inside a Discord server.', ephemeral: true });
    return;
  }

  const canManage =
    ctx.member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
    ctx.member?.permissions.has(PermissionFlagsBits.Administrator);

  if (!canManage) {
    await ctx.reply({
      content: '❌ You require **Manage Server** permissions to set stream notification channels.',
      ephemeral: true,
    });
    return;
  }

  const targetChannel =
    ((await ctx.options.getChannel('channel')) as GuildTextBasedChannel | null) ??
    (ctx.channel as GuildTextBasedChannel | null);

  if (!targetChannel) {
    await ctx.reply({
      content: '❌ Please specify or mention a valid text channel.\nExample: `/stream channel channel:#streams` or `!setup-twitch #streams`',
      ephemeral: true,
    });
    return;
  }

  // Update all current subscriptions in this guild to point to the new channel
  const subscriptions = await services.streamRepo.getSubscriptionsByGuild(ctx.guildId);
  for (const sub of subscriptions) {
    await services.streamRepo.addSubscription({
      ...sub,
      channelId: targetChannel.id,
    });
  }

  await ctx.reply({
    content: `✅ **Stream Alerts Channel Configured!**\nAll stream alerts in this server will now be delivered to <#${targetChannel.id}>. (${subscriptions.length} active subscriptions updated)`,
  });
}
