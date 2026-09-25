import { createHash } from 'node:crypto';
import { EmbedBuilder, AttachmentBuilder, type Client, type TextBasedChannel } from 'discord.js';
import type { StreamRepository, Streamer } from '@ririko/database';
import type { LiveStreamInfo } from './types.js';

export interface StreamNotificationDispatcherOptions {
  fetchFn?: typeof fetch | undefined;
}

export class StreamNotificationDispatcher {
  private readonly fetch: typeof fetch;

  constructor(
    private readonly client: Client,
    private readonly streamRepo: StreamRepository,
    options: StreamNotificationDispatcherOptions = {},
  ) {
    this.fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  formatMessage(
    template: string | null | undefined,
    stream: LiveStreamInfo,
    mentionRoleId?: string | null,
  ): string {
    const defaultTemplate = '{role} 🔴 **{streamer}** is now live on **{platform}**!\n<{url}>';
    const raw = template && template.trim().length > 0 ? template : defaultTemplate;

    const roleMention = mentionRoleId ? `<@&${mentionRoleId}>` : '';
    const streamerName = stream.streamerDisplayName || stream.streamerUsername;

    return raw
      .replace(/{role}/gi, roleMention)
      .replace(/{streamer}/gi, streamerName)
      .replace(/{title}/gi, stream.title)
      .replace(/{game}/gi, stream.gameName || 'Streaming')
      .replace(/{platform}/gi, stream.platform)
      .replace(/{url}/gi, stream.streamUrl)
      .replace(/\s+/g, ' ')
      .trim();
  }

  async buildNotificationPayload(
    stream: LiveStreamInfo,
    customMessage?: string | null,
    mentionRoleId?: string | null,
  ) {
    const formattedContent = this.formatMessage(customMessage, stream, mentionRoleId);

    // Platform theme colors
    let embedColor = 0x9146ff; // Twitch Purple
    if (stream.platform === 'YOUTUBE') embedColor = 0xff0000;
    if (stream.platform === 'TIKTOK') embedColor = 0x00f2fe;

    const streamerName = stream.streamerDisplayName || stream.streamerUsername;
    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(stream.title.slice(0, 256))
      .setURL(stream.streamUrl)
      .setAuthor({
        name: `${streamerName} is live on ${stream.platform}!`,
        url: stream.streamUrl,
      })
      .setTimestamp(stream.startedAt)
      .setFooter({ text: `Ririko AI • ${stream.platform} Stream Alert` });

    if (stream.gameName) {
      embed.addFields({ name: 'Category', value: stream.gameName, inline: true });
    }
    if (stream.viewerCount > 0) {
      embed.addFields({
        name: 'Viewers',
        value: stream.viewerCount.toLocaleString(),
        inline: true,
      });
    }

    // Proxy and cache thumbnail
    let attachment: AttachmentBuilder | null = null;
    if (stream.thumbnailUrl) {
      try {
        const res = await this.fetch(stream.thumbnailUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RirikoBot/2.0)' },
        });

        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const fileHash = createHash('sha256').update(buffer).digest('hex');

          attachment = new AttachmentBuilder(buffer, { name: 'stream_thumb.jpg' });
          embed.setImage('attachment://stream_thumb.jpg');

          // Record in stream_assets table
          await this.streamRepo.saveCachedAsset({
            streamId: stream.streamId,
            originalUrl: stream.thumbnailUrl,
            discordAttachmentUrl: 'attachment://stream_thumb.jpg',
            fileHash,
          });
        } else {
          embed.setImage(stream.thumbnailUrl);
        }
      } catch (thumbErr) {
        console.warn(
          `[StreamDispatcher] Failed to proxy thumbnail for ${stream.streamId}:`,
          thumbErr,
        );
        embed.setImage(stream.thumbnailUrl);
      }
    }

    return {
      content: formattedContent,
      embeds: [embed],
      files: attachment ? [attachment] : [],
    };
  }

  async dispatch(streamer: Streamer, stream: LiveStreamInfo): Promise<number> {
    const subscriptions = await this.streamRepo.getSubscriptionsByStreamer(streamer.id);
    if (subscriptions.length === 0) return 0;

    let dispatchedCount = 0;

    for (const sub of subscriptions) {
      const idempotencyKey = `${stream.platform}:${stream.streamId}:${sub.guildId}:${sub.channelId}`;

      // Enforce exactly-once announcement delivery
      const alreadySent = await this.streamRepo.isAnnounced(idempotencyKey);
      if (alreadySent) continue;

      try {
        const channel = (await this.client.channels.fetch(
          sub.channelId,
        )) as TextBasedChannel | null;
        if (!channel || !('send' in channel)) {
          console.warn(`[StreamDispatcher] Channel ${sub.channelId} not found or not text-based`);
          continue;
        }

        const payload = await this.buildNotificationPayload(
          stream,
          sub.customMessage,
          sub.mentionRoleId,
        );

        const sentMessage = await channel.send(payload);

        // Record announcement idempotency record
        await this.streamRepo.recordAnnouncement({
          idempotencyKey,
          guildId: sub.guildId,
          channelId: sub.channelId,
          messageId: sentMessage.id,
        });

        dispatchedCount++;
      } catch (err) {
        console.error(
          `[StreamDispatcher] Error dispatching to guild ${sub.guildId} channel ${sub.channelId}:`,
          err,
        );
      }
    }

    return dispatchedCount;
  }
}
