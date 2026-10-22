import type { Guild } from 'discord.js';
import type { StarboardRepository } from '@ririko/database';

/** A server's starboard settings, as the service uses them. */
export interface StarboardConfig {
  /** The channel the copies go to. The starboard is off while this is unset. */
  channelId: string;
  /** The emoji as the admin saved it: a Unicode emoji or `<:name:id>`. It is shown on the copy. */
  emojiText: string;
  /** What a reaction must match to count: a custom emoji's ID, or a Unicode name. */
  emoji: { id: string | null; name: string };
  /** The stars a message needs to be posted. */
  threshold: number;
  /** True counts the author's own star. */
  allowSelfStar: boolean;
  /** Messages in these channels (and in threads of them) are never posted. */
  ignoredChannelIds: ReadonlySet<string>;
}

export interface StarboardServiceOptions {
  repo: Pick<
    StarboardRepository,
    | 'getSettings'
    | 'findByMessage'
    | 'findByStarboardMessage'
    | 'insertPost'
    | 'updatePost'
    | 'deletePost'
  >;
  /**
   * Where `messageDeleted` finds the server, because a delete event may carry only IDs. Pass
   * `client.guilds`.
   */
  guilds: { cache: { get(guildId: string): Guild | undefined } };
  /** How long a server's settings are cached. Defaults to 5 minutes. */
  cacheTtlMs?: number;
  /** The clock in milliseconds, so tests are deterministic. */
  now?: () => number;
}
