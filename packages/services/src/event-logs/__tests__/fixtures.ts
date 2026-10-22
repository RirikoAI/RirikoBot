import { ChannelType } from 'discord.js';
import type { EventLogSettings } from '@ririko/database';
import { vi, type Mock } from 'vitest';

export const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
export const GUILD_ID = 'g1';

/** Casts a plain test object to the discord.js type a method takes. */
export function fake<T>(value: object): T {
  return value as unknown as T;
}

export function makeSettings(overrides: Partial<EventLogSettings> = {}): EventLogSettings {
  return {
    guildId: GUILD_ID,
    messageChannelId: 'mlog',
    memberChannelId: 'plog',
    serverChannelId: 'slog',
    voiceChannelId: 'vlog',
    ignoredChannelIds: [],
    ignoreBots: true,
    updatedAt: new Date(NOW),
    ...overrides,
  };
}

export interface FakeLogChannel {
  id: string;
  isSendable: () => boolean;
  send: Mock;
}

export function makeLogChannel(id: string, sendable = true): FakeLogChannel {
  return { id, isSendable: () => sendable, send: vi.fn().mockResolvedValue(undefined) };
}

export function makeGuild(channels: FakeLogChannel[]) {
  return {
    id: GUILD_ID,
    name: 'Test Server',
    memberCount: 42,
    channels: { cache: new Map(channels.map((channel) => [channel.id, channel])) },
  };
}

export type FakeGuild = ReturnType<typeof makeGuild>;

export function makeUser(id: string, options: { bot?: boolean; tag?: string | null } = {}) {
  return {
    id,
    bot: options.bot ?? false,
    tag: options.tag === undefined ? `${id}#0` : options.tag,
    createdTimestamp: NOW - 3 * 86_400_000,
  };
}

export function makeThreadChannel(id: string, parentId: string) {
  return { id, parentId, isThread: () => true };
}

export function makeTextChannel(id: string) {
  return { id, parentId: null, isThread: () => false };
}

export function makeMessage(guild: FakeGuild | null, overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    guild,
    channelId: 'c1',
    channel: makeTextChannel('c1'),
    author: makeUser('u1'),
    content: 'hello',
    editedTimestamp: null,
    createdTimestamp: NOW - 1000,
    url: 'https://discord.com/channels/g1/c1/m1',
    partial: false,
    attachments: new Map<string, { name: string }>(),
    ...overrides,
  };
}

/** A role cache whose keys are the role IDs (the @everyone role is the guild ID). */
export function roleCache(ids: string[]) {
  return { cache: new Map(ids.map((id) => [id, { id }])) };
}

export function makeMember(guild: FakeGuild, overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    guild,
    user: makeUser('u1'),
    nickname: null,
    partial: false,
    joinedTimestamp: NOW - 86_400_000,
    communicationDisabledUntilTimestamp: null,
    roles: roleCache([GUILD_ID]),
    ...overrides,
  };
}

export function makeGuildChannel(guild: FakeGuild, overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch1',
    name: 'general',
    type: ChannelType.GuildText,
    parentId: null,
    guild,
    isDMBased: () => false,
    ...overrides,
  };
}

export function makeRole(guild: FakeGuild, overrides: Record<string, unknown> = {}) {
  return { id: 'r1', name: 'Mods', hexColor: '#ff0000', guild, ...overrides };
}

export function makeVoiceState(
  guild: FakeGuild,
  channelId: string | null,
  member: object | null,
  overrides: Record<string, unknown> = {},
) {
  return { guild, channelId, member, ...overrides };
}

export function makeBan(guild: FakeGuild, overrides: Record<string, unknown> = {}) {
  return { guild, user: makeUser('u2'), reason: 'spamming', partial: false, ...overrides };
}

/** The first embed of the first send to `channel`, as JSON. */
export function sentEmbed(channel: FakeLogChannel, index = 0) {
  const call = channel.send.mock.calls[0]?.[0] as {
    embeds: Array<{ toJSON(): Record<string, unknown> }>;
  };
  return call.embeds[index]!.toJSON() as {
    title: string;
    color: number;
    timestamp: string;
    footer?: { text: string };
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  };
}

export function fieldOf(embed: ReturnType<typeof sentEmbed>, name: string): string | undefined {
  return embed.fields?.find((field) => field.name === name)?.value;
}
