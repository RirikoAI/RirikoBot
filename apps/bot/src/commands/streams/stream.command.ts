import {
  EmbedBuilder,
  PermissionFlagsBits,
  type GuildTextBasedChannel,
  type Role,
} from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import type { StreamPlatform } from '@ririko/services';

const PLATFORM_CHOICES = [
  { name: 'Twitch', value: 'TWITCH' },
  { name: 'YouTube Live', value: 'YOUTUBE' },
  { name: 'TikTok Live', value: 'TIKTOK' },
];

export function inferPlatform(input: string, explicitPlatform?: string | null): StreamPlatform {
  if (
    explicitPlatform &&
    ['TWITCH', 'YOUTUBE', 'TIKTOK'].includes(explicitPlatform.toUpperCase())
  ) {
    return explicitPlatform.toUpperCase() as StreamPlatform;
  }

  const lower = input.toLowerCase().trim();
  if (lower.includes('youtube.com') || lower.includes('youtu.be') || lower.startsWith('uc')) {
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

export function cleanStreamerIdentifier(input: string): string {
  let clean = input.trim();
  clean = clean.replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '');
  clean = clean.replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, '');
  clean = clean.replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '');
  clean = clean.replace(/^https?:\/\/(www\.)?youtube\.com\/(@|channel\/|c\/)?/i, '');
  clean = clean.replace(/^https?:\/\/youtu\.be\//i, '');
  clean = clean.replace(/^@/, '');
  clean = clean.split('/')[0]!;
  clean = clean.split('?')[0]!;
  return clean.trim();
}

/**
 * Creates the complete Stream alerts dual-dispatch command suite across Twitch, YouTube, and TikTok.
 */
export function createStreamCommands(services: BotServices): Command[] {
  // 1. Primary /stream command with subcommands
  const streamCommand: Command = {
    metadata: {
      name: 'stream',
      category: CommandCategory.UTILITY,
      description: 'Configure and monitor live stream alerts across Twitch, YouTube, and TikTok',
      usage: '/stream <subscribe|unsubscribe|list|channel|check>',
      examples: [
        '/stream subscribe streamer:shroud platform:Twitch channel:#streams',
        '/stream subscribe streamer:@LofiGirl platform:YouTube channel:#music',
        '/stream unsubscribe streamer:shroud',
        '/stream list',
        '/stream channel channel:#announcements',
        '/stream check',
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
            { name: 'Check (Trigger Immediate Stream Check)', value: 'check' },
          ],
        },
        {
          name: 'streamer',
          description: 'Streamer username, handle, channel ID, or profile URL',
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
          description:
            'Custom message template (Variables: {streamer}, {title}, {game}, {url}, {role})',
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
        if (
          [
            'subscribe',
            'sub',
            'add',
            'unsubscribe',
            'unsub',
            'remove',
            'list',
            'status',
            'channel',
            'setchannel',
            'check',
            'poll',
          ].includes(first)
        ) {
          if (['sub', 'add'].includes(first)) action = 'subscribe';
          else if (['unsub', 'remove'].includes(first)) action = 'unsubscribe';
          else if (['status'].includes(first)) action = 'list';
          else if (['setchannel'].includes(first)) action = 'channel';
          else if (['poll'].includes(first)) action = 'check';
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

      if (action === 'check') {
        await handleCheckStreams(ctx, services);
        return;
      }

      await ctx.reply({
        content:
          '❓ Unknown stream subcommand. Use `/stream subscribe`, `/stream unsubscribe`, `/stream list`, `/stream channel`, or `/stream check`.',
        ephemeral: true,
      });
    },
  };

  // 2. Legacy alias: !subscribe <streamer> [platform]
  const legacySubscribeCommand: Command = {
    metadata: {
      name: 'subscribe',
      category: CommandCategory.UTILITY,
      description: 'Subscribe this server to live alerts for a streamer (Twitch, YouTube, TikTok)',
      aliases: ['sub', 'stream-sub', 'streamsub'],
      usage: '!subscribe <streamer> [platform]',
      examples: ['!subscribe shroud', '!subscribe shroud twitch', '!subscribe @MrBeast youtube'],
    },
    async execute(ctx: CommandContext): Promise<void> {
      await handleSubscribeStream(ctx, services);
    },
  };

  // 3. Legacy alias: !unsubscribe <streamer> [platform]
  const legacyUnsubscribeCommand: Command = {
    metadata: {
      name: 'unsubscribe',
      category: CommandCategory.UTILITY,
      description:
        'Unsubscribe this server from live alerts for a streamer (Twitch, YouTube, TikTok)',
      aliases: ['unsub', 'stream-unsub', 'streamunsub'],
      usage: '!unsubscribe <streamer> [platform]',
      examples: ['!unsubscribe shroud', '!unsubscribe @LofiGirl', '!unsubscribe shroud twitch'],
    },
    async execute(ctx: CommandContext): Promise<void> {
      await handleUnsubscribeStream(ctx, services);
    },
  };

  // 4. Generalized Setup Command: !setup-stream-notification <#channel> (legacy !setup-twitch)
  const setupStreamNotificationCommand: Command = {
    metadata: {
      name: 'setup-stream-notification',
      category: CommandCategory.UTILITY,
      description:
        'Set default channel for live stream announcements across Twitch, YouTube, and TikTok',
      aliases: [
        'setup-twitch',
        'setup-stream',
        'setup-streams',
        'setup-stream-channel',
        'setstreamchannel',
        'stream-channel',
      ],
      usage: '!setup-stream-notification <#channel>',
      examples: ['!setup-stream-notification #live-streams', '!setup-twitch #live-streams'],
      options: [
        {
          name: 'channel',
          description: 'Text channel to post live stream announcements in',
          type: 'CHANNEL',
          required: true,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      await handleSetStreamChannel(ctx, services);
    },
  };

  // 5. Generalized Status Command: !stream-status (legacy !twitch-status)
  const streamStatusCommand: Command = {
    metadata: {
      name: 'stream-status',
      category: CommandCategory.UTILITY,
      description:
        'List all currently monitored streamers across Twitch, YouTube, and TikTok and their live status',
      aliases: ['twitch-status', 'streamstatus', 'streams', 'streamers'],
      usage: '!stream-status',
      examples: ['!stream-status', '!twitch-status'],
    },
    async execute(ctx: CommandContext): Promise<void> {
      await handleListStreams(ctx, services);
    },
  };

  return [
    streamCommand,
    legacySubscribeCommand,
    legacyUnsubscribeCommand,
    setupStreamNotificationCommand,
    streamStatusCommand,
  ];
}

async function handleSubscribeStream(ctx: CommandContext, services: BotServices): Promise<void> {
  if (!ctx.guildId) {
    await ctx.reply({
      content: '❌ Stream alerts can only be configured inside a Discord server.',
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
        '❌ You require **Manage Server** permissions to configure stream alert subscriptions.',
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
      content:
        '❌ Please provide a streamer username, channel name, or profile URL.\nExample: `/stream subscribe streamer:shroud` or `!subscribe shroud twitch`',
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
    await ctx.reply({
      content: '❌ Stream alerts can only be configured inside a Discord server.',
      ephemeral: true,
    });
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
  let platformInput = ctx.options.getString('platform');

  if (!streamerInput && rawArgs.length > 0) {
    const offset = ['unsubscribe', 'unsub', 'remove'].includes(rawArgs[0]!.toLowerCase()) ? 1 : 0;
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
      content:
        '❌ Please provide the streamer username to unsubscribe from.\nExample: `/stream unsubscribe streamer:shroud` or `!unsubscribe shroud`',
      ephemeral: true,
    });
    return;
  }

  const identifier = cleanStreamerIdentifier(streamerInput).toLowerCase();
  const explicitPlatform = platformInput ? inferPlatform(streamerInput, platformInput) : null;

  await ctx.deferReply();

  try {
    // 1. Fetch guild subscriptions
    let subsWithStreamers: Array<{ subscription: any; streamer: any }> = [];
    if (typeof services.streamRepo.listGuildSubscriptionsWithStreamers === 'function') {
      subsWithStreamers = await services.streamRepo
        .listGuildSubscriptionsWithStreamers(ctx.guildId)
        .catch(() => []);
    }

    if (subsWithStreamers.length === 0) {
      const rawSubs = await services.streamRepo.getSubscriptionsByGuild(ctx.guildId);
      for (const sub of rawSubs) {
        const streamer = await services.streamRepo.findById(sub.streamerId);
        if (streamer) {
          subsWithStreamers.push({ subscription: sub, streamer });
        }
      }
    }

    // 2. Find matching subscriptions in this guild across all platforms
    const matches = subsWithStreamers.filter(({ streamer }) => {
      const usernameMatch = streamer.username.toLowerCase() === identifier;
      const displayNameMatch = streamer.displayName?.toLowerCase() === identifier;
      const platformUserMatch = streamer.platformUserId.toLowerCase() === identifier;
      const idMatch = streamer.id.toLowerCase() === identifier;

      const isMatch = usernameMatch || displayNameMatch || platformUserMatch || idMatch;
      if (!isMatch) return false;

      if (explicitPlatform) {
        return streamer.platform.toUpperCase() === explicitPlatform;
      }
      return true;
    });

    // 3. Fallback: if not found in local joined cache, try repository findByUsername
    if (matches.length === 0) {
      const platformToSearch = explicitPlatform || inferPlatform(streamerInput, null);
      const streamer = await services.streamRepo.findByUsername(platformToSearch, identifier);
      if (streamer) {
        matches.push({
          subscription: { streamerId: streamer.id, guildId: ctx.guildId },
          streamer,
        });
      }
    }

    if (matches.length === 0) {
      const activeList =
        subsWithStreamers.length > 0
          ? '\n\n**Active server subscriptions:** ' +
            subsWithStreamers
              .map(
                (s) =>
                  `\`${s.streamer.displayName || s.streamer.username}\` (${s.streamer.platform})`,
              )
              .join(', ')
          : '';
      await ctx.editReply({
        content: `❌ No active streamer subscription found for \`${identifier}\`${
          explicitPlatform ? ` on **${explicitPlatform}**` : ''
        } in this server.${activeList}`,
      });
      return;
    }

    if (matches.length > 1) {
      const platformNames = matches.map((m) => `**${m.streamer.platform}**`).join(' and ');
      await ctx.editReply({
        content: `⚠️ Found multiple subscriptions matching \`${identifier}\` on ${platformNames}.\nPlease specify the platform:\nExample: \`/stream unsubscribe streamer:${identifier} platform:${matches[0]!.streamer.platform}\` or \`!unsubscribe ${identifier} ${matches[0]!.streamer.platform.toLowerCase()}\``,
      });
      return;
    }

    const target = matches[0]!;
    await services.streamRepo.removeSubscription(ctx.guildId, target.streamer.id);

    await ctx.editReply({
      content: `✅ Successfully unsubscribed from live alerts for **${target.streamer.displayName || target.streamer.username}** on **${target.streamer.platform}**.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.editReply({ content: `❌ Error unsubscribing: ${message}` });
  }
}

async function handleListStreams(ctx: CommandContext, services: BotServices): Promise<void> {
  if (!ctx.guildId) {
    await ctx.reply({
      content: '❌ Stream alerts can only be viewed inside a Discord server.',
      ephemeral: true,
    });
    return;
  }

  await ctx.deferReply();

  try {
    let subsWithStreamers: Array<{ subscription: any; streamer: any }> = [];
    if (typeof services.streamRepo.listGuildSubscriptionsWithStreamers === 'function') {
      subsWithStreamers = await services.streamRepo
        .listGuildSubscriptionsWithStreamers(ctx.guildId)
        .catch(() => []);
    }

    if (subsWithStreamers.length === 0) {
      const subscriptions = await services.streamRepo.getSubscriptionsByGuild(ctx.guildId);
      for (const sub of subscriptions) {
        const streamer = await services.streamRepo.findById(sub.streamerId);
        if (streamer) {
          subsWithStreamers.push({ subscription: sub, streamer });
        }
      }
    }

    if (subsWithStreamers.length === 0) {
      await ctx.editReply({
        content:
          '📡 **No active stream subscriptions in this server.**\nUse `/stream subscribe` or `!subscribe <streamer> [platform]` to set up alerts for Twitch, YouTube, or TikTok!',
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📡 Subscribed Streamers')
      .setColor(0x5865f2)
      .setDescription(
        `This server is currently monitoring **${subsWithStreamers.length}** streamer(s) across Twitch, YouTube, and TikTok:`,
      )
      .setFooter({ text: 'Ririko AI Stream Watcher' })
      .setTimestamp();

    for (const item of subsWithStreamers) {
      const { streamer, subscription: sub } = item;
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
    await ctx.reply({
      content: '❌ Stream alert channel can only be configured inside a Discord server.',
      ephemeral: true,
    });
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
      content:
        '❌ Please specify or mention a valid text channel.\nExample: `/stream channel channel:#streams` or `!setup-stream-notification #streams`',
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
    content: `✅ **Stream Alerts Channel Configured!**\nAll live stream alerts (Twitch, YouTube, TikTok) in this server will now be delivered to <#${targetChannel.id}>. (${subscriptions.length} active subscription(s) updated)`,
  });
}

async function handleCheckStreams(ctx: CommandContext, services: BotServices): Promise<void> {
  if (!ctx.guildId) {
    await ctx.reply({
      content: '❌ Stream checks can only be run inside a Discord server.',
      ephemeral: true,
    });
    return;
  }

  const canManage =
    ctx.member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
    ctx.member?.permissions.has(PermissionFlagsBits.Administrator);

  if (!canManage) {
    await ctx.reply({
      content: '❌ You require **Manage Server** permissions to trigger diagnostic stream checks.',
      ephemeral: true,
    });
    return;
  }

  await ctx.deferReply();

  try {
    const result =
      typeof (services.streamWatcher as any).checkStreamsDetailed === 'function'
        ? await (services.streamWatcher as any).checkStreamsDetailed()
        : {
            totalChecked: 0,
            liveCount: await services.streamWatcher.checkStreams(),
            errors: 0,
            durationMs: 0,
          };

    const monitored = await services.streamRepo.listActiveMonitoredStreamers();
    const liveStreamers = monitored.filter((s) => s.isLive);

    const embed = new EmbedBuilder()
      .setTitle('📡 Stream Watcher Diagnostic Poll')
      .setColor(0x5865f2)
      .setDescription(`Manual stream check cycle executed in **${result.durationMs}ms**.`)
      .addFields(
        {
          name: 'Checked Streamers',
          value: `\`${result.totalChecked || monitored.length}\``,
          inline: true,
        },
        { name: 'Live Now', value: `\`${result.liveCount}\``, inline: true },
        {
          name: 'Check Interval',
          value: `${((services.streamWatcher as any).getCheckIntervalMs?.() ?? 60000) / 1000}s`,
          inline: true,
        },
      )
      .setFooter({ text: 'Ririko AI Stream Watcher' })
      .setTimestamp();

    if (liveStreamers.length > 0) {
      embed.addFields({
        name: '🟢 Currently Live Streamers',
        value: liveStreamers
          .map((s) => `• **${s.displayName || s.username}** (${s.platform})`)
          .join('\n'),
      });
    }

    await ctx.editReply({ embeds: [embed] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.editReply({ content: `❌ Error checking streams: ${message}` });
  }
}
