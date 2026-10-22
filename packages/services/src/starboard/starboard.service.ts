import {
  RESTJSONErrorCodes,
  type GuildTextBasedChannel,
  type Message,
  type MessageReaction,
  type User,
} from 'discord.js';
import { parseStarboardEmoji } from '@ririko/core';
import { buildStarboardEmbed, formatStarboardContent } from './embeds.js';
import type { StarboardConfig, StarboardServiceOptions } from './types.js';

/** Reactors Discord returns for one page. */
const REACTOR_PAGE_SIZE = 100;

/** Most pages of reactors read for one count (1000 users). Past that the count is not corrected. */
const MAX_REACTOR_PAGES = 10;

const VARIATION_SELECTOR = /️/g;

/** The text of an error for the console. Never the content of a message. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isUnknownMessage(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === RESTJSONErrorCodes.UnknownMessage
  );
}

/** The channel's parent when it is a thread, so a thread follows the channel it belongs to. */
function threadParentId(channel: Message['channel']): string | null {
  return channel.isThread() ? channel.parentId : null;
}

/** True for an NSFW channel, or a thread of one. */
function isNsfw(channel: Message['channel'] | GuildTextBasedChannel): boolean {
  if (channel.isThread()) return channel.parent?.nsfw === true;
  return 'nsfw' in channel && channel.nsfw === true;
}

/**
 * Posts a copy of every message that gets enough stars to the starboard channel and keeps the star
 * count on the copy up to date (STORY-201). The gateway listener only forwards discord.js objects
 * and IDs here; this class decides whether a message counts, counts the stars, and posts, edits
 * or removes the copy.
 *
 * Stars are counted on the original message only; stars on the copy do not count. Work for one
 * message ID runs one step at a time, so a burst of reactions posts once. Nothing here throws to
 * the gateway: errors are logged with guild, channel and message IDs, never with message content.
 *
 * Settings are cached per server; the bot drops a server on `guild:configChanged` for the
 * `starboard` module and the TTL is only a safety net.
 */
export class StarboardService {
  private readonly repo: StarboardServiceOptions['repo'];
  private readonly guilds: StarboardServiceOptions['guilds'];
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, { config: StarboardConfig | null; cachedAt: number }>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(options: StarboardServiceOptions) {
    this.repo = options.repo;
    this.guilds = options.guilds;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  /** Drops a server's cached settings (or every server's) so the next event reads them again. */
  invalidate(guildId?: string): void {
    if (guildId) this.cache.delete(guildId);
    else this.cache.clear();
  }

  /**
   * A star was added or removed, or a message's stars were cleared. Pass the fetched message (a
   * partial message has no author or reactions). The matching reaction is read from the message,
   * so every kind of reaction event takes this one call.
   */
  async reactionChanged(message: Message): Promise<void> {
    await this.guard('reactionChanged', message.guildId, async () => {
      const guild = message.guild;
      if (!guild || message.webhookId || message.system) return;

      const config = await this.getConfig(guild.id);
      if (!config) return;
      const parentId = threadParentId(message.channel);
      if (
        message.channelId === config.channelId ||
        config.ignoredChannelIds.has(message.channelId) ||
        (parentId !== null && config.ignoredChannelIds.has(parentId))
      ) {
        return;
      }
      const target = this.resolveChannel(guild.channels.cache.get(config.channelId));
      if (!target) return;
      if (isNsfw(message.channel) && !isNsfw(target)) return;

      await this.enqueue(message.id, () =>
        this.guard('reactionChanged', guild.id, () => this.sync(message, config, target)),
      );
    });
  }

  /**
   * A message was deleted. When it is a starred original, its copy and row are removed. When it is
   * a copy, the row is marked removed so the message is never posted again. Takes IDs only, as a
   * delete event may not carry the message.
   */
  async messageDeleted(guildId: string, messageId: string): Promise<void> {
    await this.guard('messageDeleted', guildId, () =>
      this.enqueue(messageId, () =>
        this.guard('messageDeleted', guildId, async () => {
          const original = await this.repo.findByMessage(messageId);
          if (original) {
            if (original.guildId !== guildId) return;
            await this.removeCopyAndRow(original, await this.channelOf(guildId));
            return;
          }
          const copy = await this.repo.findByStarboardMessage(messageId);
          if (copy && copy.guildId === guildId && !copy.removed) {
            await this.repo.updatePost(copy.messageId, { removed: true });
          }
        }),
      ),
    );
  }

  // ==========================================
  // Syncing one message
  // ==========================================

  /** Brings the copy in line with the message's stars. Runs inside the message's queue. */
  private async sync(
    message: Message,
    config: StarboardConfig,
    target: GuildTextBasedChannel,
  ): Promise<void> {
    const post = await this.repo.findByMessage(message.id);
    if (post?.removed) return;

    const count = await this.countStars(message, config);
    if (count === null) return;

    if (count < config.threshold) {
      if (post) await this.removeCopyAndRow(post, target);
      return;
    }
    if (!post) {
      await this.createCopy(message, config, target, count);
    } else if (!post.starboardMessageId) {
      await this.resendCopy(message, config, target, count);
    } else if (post.starCount !== count) {
      await this.editCopy(message, config, target, post.starboardMessageId, count);
    }
  }

  /**
   * The stars on a message. Starts from the reaction's count minus Ririko's own reaction. When
   * that could reach the threshold, the reactors are read so the author's own star (unless the
   * server allows it) and other bots are taken off. Returns null when the reactors cannot be read,
   * so a failed read changes nothing.
   */
  private async countStars(message: Message, config: StarboardConfig): Promise<number | null> {
    const reaction = this.findReaction(message, config);
    if (!reaction) return 0;

    const quick = reaction.count - (reaction.me ? 1 : 0);
    if (quick < config.threshold) return quick;

    try {
      const reactors = await this.fetchReactors(reaction);
      let count = reaction.count;
      for (const user of reactors) {
        if (user.bot) count -= 1;
        else if (!config.allowSelfStar && user.id === message.author.id) count -= 1;
      }
      return count;
    } catch (error) {
      console.error(
        `[StarboardService] Could not read the reactors of message ${message.id} in channel ${message.channelId} of guild ${message.guildId}:`,
        errorText(error),
      );
      return null;
    }
  }

  private findReaction(message: Message, config: StarboardConfig): MessageReaction | undefined {
    const { id, name } = config.emoji;
    return message.reactions.cache.find((reaction) =>
      id !== null
        ? reaction.emoji.id === id
        : reaction.emoji.id === null &&
          (reaction.emoji.name ?? '').replace(VARIATION_SELECTOR, '') === name,
    );
  }

  /** The users who reacted, a page at a time. Stops at the first short page. */
  private async fetchReactors(reaction: MessageReaction): Promise<User[]> {
    const users: User[] = [];
    let after: string | undefined;
    for (let page = 0; page < MAX_REACTOR_PAGES; page += 1) {
      const batch = await reaction.users.fetch(
        after ? { limit: REACTOR_PAGE_SIZE, after } : { limit: REACTOR_PAGE_SIZE },
      );
      users.push(...batch.values());
      if (batch.size < REACTOR_PAGE_SIZE) break;
      after = batch.lastKey();
    }
    return users;
  }

  // ==========================================
  // The copy
  // ==========================================

  private async createCopy(
    message: Message,
    config: StarboardConfig,
    target: GuildTextBasedChannel,
    count: number,
  ): Promise<void> {
    const copy = await this.sendCopy(message, config, target, count);
    if (!copy) return;

    let saved = false;
    try {
      saved = await this.repo.insertPost({
        messageId: message.id,
        guildId: target.guildId,
        channelId: message.channelId,
        authorId: message.author.id,
        starboardMessageId: copy.id,
        starCount: count,
      });
    } catch (error) {
      this.logPost('Could not save the starboard post', message.id, target, error);
    }
    // Another process posted first, or the row could not be saved: do not leave a stray copy.
    if (!saved) await this.deleteCopy(target, copy.id);
  }

  /** The row has no copy yet: send one and record it. */
  private async resendCopy(
    message: Message,
    config: StarboardConfig,
    target: GuildTextBasedChannel,
    count: number,
  ): Promise<void> {
    const copy = await this.sendCopy(message, config, target, count);
    if (!copy) return;
    const saved = await this.repo.updatePost(message.id, {
      starboardMessageId: copy.id,
      starCount: count,
    });
    if (!saved) await this.deleteCopy(target, copy.id);
  }

  private async editCopy(
    message: Message,
    config: StarboardConfig,
    target: GuildTextBasedChannel,
    copyId: string,
    count: number,
  ): Promise<void> {
    try {
      await target.messages.edit(copyId, {
        content: formatStarboardContent(config.emojiText, count, message.channelId),
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      if (isUnknownMessage(error)) {
        // Staff deleted the copy while the bot did not see it: never post this message again.
        await this.repo.updatePost(message.id, { removed: true });
      } else {
        this.logPost('Could not edit the starboard copy', copyId, target, error);
      }
      return;
    }
    await this.repo.updatePost(message.id, { starCount: count });
  }

  /** Sends the copy. Returns null, after logging IDs, when Discord refuses. */
  private async sendCopy(
    message: Message,
    config: StarboardConfig,
    target: GuildTextBasedChannel,
    count: number,
  ): Promise<Message | null> {
    try {
      return await target.send({
        content: formatStarboardContent(config.emojiText, count, message.channelId),
        embeds: [buildStarboardEmbed(message)],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      this.logPost('Could not post to the starboard', message.id, target, error);
      return null;
    }
  }

  /** Deletes the copy, then the row. A copy that cannot be deleted keeps its row for a retry. */
  private async removeCopyAndRow(
    post: { messageId: string; starboardMessageId: string | null; removed: boolean },
    target: GuildTextBasedChannel | null,
  ): Promise<void> {
    const copyId = post.starboardMessageId;
    if (copyId && !post.removed && target && !(await this.deleteCopy(target, copyId))) return;
    await this.repo.deletePost(post.messageId);
  }

  /** True when the copy is gone: deleted now, or already deleted. */
  private async deleteCopy(target: GuildTextBasedChannel, copyId: string): Promise<boolean> {
    try {
      await target.messages.delete(copyId);
      return true;
    } catch (error) {
      if (isUnknownMessage(error)) return true;
      this.logPost('Could not delete the starboard copy', copyId, target, error);
      return false;
    }
  }

  // ==========================================
  // Helpers
  // ==========================================

  /** The starboard channel of a server by ID, from the guild cache. */
  private async channelOf(guildId: string): Promise<GuildTextBasedChannel | null> {
    const config = await this.getConfig(guildId);
    const guild = this.guilds.cache.get(guildId);
    if (!config || !guild) return null;
    return this.resolveChannel(guild.channels.cache.get(config.channelId));
  }

  private resolveChannel(
    channel: { isTextBased(): boolean } | undefined,
  ): GuildTextBasedChannel | null {
    return channel?.isTextBased() ? (channel as GuildTextBasedChannel) : null;
  }

  /** Runs `task` after the earlier work for the same message ID, one at a time. */
  private enqueue(messageId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(messageId) ?? Promise.resolve();
    const next = previous.then(task);
    const tail: Promise<void> = next.then(
      () => this.release(messageId, tail),
      () => this.release(messageId, tail),
    );
    this.queues.set(messageId, tail);
    return next;
  }

  private release(messageId: string, tail: Promise<void>): void {
    if (this.queues.get(messageId) === tail) this.queues.delete(messageId);
  }

  /** Runs one event handler so that nothing it does can throw into the gateway. */
  private async guard(
    event: string,
    guildId: string | null,
    run: () => Promise<void>,
  ): Promise<void> {
    try {
      await run();
    } catch (error) {
      console.error(
        `[StarboardService] ${event} failed in guild ${guildId ?? 'unknown'}:`,
        errorText(error),
      );
    }
  }

  /** The server's settings, cached. Null when the starboard is off or the read failed. */
  private async getConfig(guildId: string): Promise<StarboardConfig | null> {
    const now = this.now();
    const cached = this.cache.get(guildId);
    if (cached && now - cached.cachedAt < this.cacheTtlMs) return cached.config;

    let config: StarboardConfig | null;
    try {
      const row = await this.repo.getSettings(guildId);
      config = row?.channelId
        ? {
            channelId: row.channelId,
            emojiText: row.emoji.trim(),
            emoji: parseStarboardEmoji(row.emoji),
            threshold: row.threshold,
            allowSelfStar: row.allowSelfStar,
            ignoredChannelIds: new Set(row.ignoredChannelIds),
          }
        : null;
    } catch (error) {
      console.error(
        `[StarboardService] Could not read the settings of guild ${guildId}:`,
        errorText(error),
      );
      return null;
    }
    this.cache.set(guildId, { config, cachedAt: now });
    return config;
  }

  private logPost(what: string, id: string, target: GuildTextBasedChannel, error: unknown): void {
    console.error(
      `[StarboardService] ${what} ${id} in channel ${target.id} of guild ${target.guildId}:`,
      errorText(error),
    );
  }
}
