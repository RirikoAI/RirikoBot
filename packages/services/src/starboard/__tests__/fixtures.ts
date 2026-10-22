import { Collection } from 'discord.js';
import type {
  NewStarboardPost,
  StarboardPost,
  StarboardPostPatch,
  StarboardSettings,
} from '@ririko/database';
import { vi, type Mock } from 'vitest';

export const NOW = Date.UTC(2026, 10, 22, 12, 0, 0);
export const GUILD_ID = 'g1';
export const STAR_CHANNEL_ID = 'star';

/** Casts a plain test object to the discord.js type a method takes. */
export function fake<T>(value: object): T {
  return value as unknown as T;
}

export function makeSettings(overrides: Partial<StarboardSettings> = {}): StarboardSettings {
  return {
    guildId: GUILD_ID,
    channelId: STAR_CHANNEL_ID,
    emoji: '⭐',
    threshold: 3,
    allowSelfStar: false,
    ignoredChannelIds: [],
    updatedAt: new Date(NOW),
    ...overrides,
  };
}

export function makePost(overrides: Partial<StarboardPost> = {}): StarboardPost {
  return {
    messageId: 'm1',
    guildId: GUILD_ID,
    channelId: 'c1',
    authorId: 'author',
    starboardMessageId: 'copy1',
    starCount: 3,
    removed: false,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  };
}

/** An in-memory StarboardRepository over the post methods, with the real duplicate rules. */
export function makeRepo() {
  const posts = new Map<string, StarboardPost>();
  const settings: { row: StarboardSettings | null } = { row: makeSettings() };
  const repo = {
    getSettings: vi.fn(async (_guildId: string) => settings.row),
    findByMessage: vi.fn(async (messageId: string) => posts.get(messageId) ?? null),
    findByStarboardMessage: vi.fn(
      async (copyId: string) =>
        [...posts.values()].find((post) => post.starboardMessageId === copyId) ?? null,
    ),
    insertPost: vi.fn(async (data: NewStarboardPost) => {
      const copyId = data.starboardMessageId ?? null;
      const duplicate =
        posts.has(data.messageId) ||
        (copyId !== null && [...posts.values()].some((post) => post.starboardMessageId === copyId));
      if (duplicate) return false;
      posts.set(data.messageId, makePost(data as Partial<StarboardPost>));
      return true;
    }),
    updatePost: vi.fn(async (messageId: string, patch: StarboardPostPatch) => {
      const post = posts.get(messageId);
      if (!post) return null;
      const updated = { ...post, ...patch } as StarboardPost;
      posts.set(messageId, updated);
      return updated;
    }),
    deletePost: vi.fn(async (messageId: string) => posts.delete(messageId)),
  };
  return { repo, posts, settings };
}

export interface FakeStarChannel {
  id: string;
  guildId: string;
  nsfw: boolean;
  isTextBased: () => boolean;
  isThread: () => boolean;
  send: Mock;
  messages: { edit: Mock; delete: Mock };
}

export function makeStarChannel(overrides: Partial<FakeStarChannel> = {}): FakeStarChannel {
  return {
    id: STAR_CHANNEL_ID,
    guildId: GUILD_ID,
    nsfw: false,
    isTextBased: () => true,
    isThread: () => false,
    send: vi.fn().mockResolvedValue({ id: 'copy1' }),
    messages: {
      edit: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

export function makeGuild(channels: object[]) {
  return {
    id: GUILD_ID,
    channels: {
      cache: new Map(channels.map((channel) => [(channel as { id: string }).id, channel])),
    },
  };
}

export type FakeGuild = ReturnType<typeof makeGuild>;

export function makeUser(id: string, bot = false) {
  return {
    id,
    bot,
    username: `user-${id}`,
    displayName: `User ${id}`,
    displayAvatarURL: () => `https://cdn.example/${id}.png`,
  };
}

export function makeTextChannel(id: string, nsfw = false) {
  return { id, nsfw, isThread: () => false };
}

export function makeThreadChannel(id: string, parentId: string, parentNsfw = false) {
  return {
    id,
    parentId,
    parent: { id: parentId, nsfw: parentNsfw },
    isThread: () => true,
  };
}

export interface FakeReaction {
  emoji: { id: string | null; name: string | null };
  count: number;
  me: boolean;
  users: { fetch: Mock };
}

/** A reaction whose `users.fetch` pages through `reactors` the way Discord does. */
export function makeReaction(
  count: number,
  options: {
    emoji?: { id: string | null; name: string | null };
    me?: boolean;
    reactors?: object[];
  } = {},
): FakeReaction {
  const reactors = (options.reactors ?? []) as Array<{ id: string }>;
  return {
    emoji: options.emoji ?? { id: null, name: '⭐' },
    count,
    me: options.me ?? false,
    users: {
      fetch: vi.fn(async (opts: { limit?: number; after?: string } = {}) => {
        const start = opts.after ? reactors.findIndex((user) => user.id === opts.after) + 1 : 0;
        const page = reactors.slice(start, start + (opts.limit ?? 100));
        return new Collection(page.map((user) => [user.id, user] as const));
      }),
    },
  };
}

export function makeMessage(
  guild: FakeGuild | null,
  reactions: FakeReaction[],
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'm1',
    guild,
    guildId: guild?.id ?? null,
    channelId: 'c1',
    channel: makeTextChannel('c1'),
    author: makeUser('author'),
    member: null,
    content: 'a message worth a star',
    url: 'https://discord.com/channels/g1/c1/m1',
    createdTimestamp: NOW - 60_000,
    webhookId: null,
    system: false,
    attachments: new Collection<
      string,
      { name: string; url: string; contentType?: string | null }
    >(),
    embeds: [] as object[],
    reactions: {
      cache: new Collection(reactions.map((reaction, index) => [String(index), reaction] as const)),
    },
    ...overrides,
  };
}
