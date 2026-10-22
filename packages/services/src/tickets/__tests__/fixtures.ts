import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type { GuildMember, TextChannel, User } from 'discord.js';
import type { Ticket, TicketSettings } from '@ririko/database';
import { vi, type Mock } from 'vitest';

export const T_OPEN = new Date('2026-10-21T10:00:00.000Z');
export const T_NOW = new Date('2026-10-21T12:30:15.000Z');

export function permissions(granted: bigint[]) {
  return {
    has: (wanted: bigint | bigint[]) =>
      (Array.isArray(wanted) ? wanted : [wanted]).every((flag) => granted.includes(flag)),
  };
}

export const BOT_PERMISSIONS = [
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
];

export function makeSettings(overrides: Partial<TicketSettings> = {}): TicketSettings {
  return {
    guildId: 'g1',
    isEnabled: true,
    categoryId: 'cat1',
    staffRoleIds: ['staff1', 'staff2'],
    transcriptChannelId: 'transcripts',
    maxOpenPerUser: 1,
    welcomeMessage: null,
    nextNumber: 42,
    updatedAt: T_OPEN,
    ...overrides,
  };
}

export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-id-1',
    guildId: 'g1',
    number: 42,
    channelId: 'chan1',
    openerId: 'opener',
    subject: 'Cannot log in',
    status: 'open',
    claimedBy: null,
    closedBy: null,
    closeReason: null,
    createdAt: T_OPEN,
    closedAt: null,
    ...overrides,
  };
}

export function makeMember(
  id: string,
  guild: unknown,
  options: { roles?: string[]; permissions?: bigint[] } = {},
): GuildMember {
  const roles = new Set(options.roles ?? []);
  return {
    id,
    guild,
    user: { id, tag: `${id}#0` },
    permissions: permissions(options.permissions ?? []),
    roles: { cache: { has: (roleId: string) => roles.has(roleId) } },
  } as unknown as GuildMember;
}

export function makeUser(id: string): User {
  return { id, tag: `${id}#0` } as unknown as User;
}

export interface FakeChannel {
  id: string;
  guild: unknown;
  client: { user: { id: string } };
  send: Mock;
  delete: Mock;
  setName: Mock;
  permissionOverwrites: { edit: Mock; delete: Mock };
  messages: { fetch: Mock };
}

/** A fake text channel; its `messages.fetch` returns an empty history until a test says otherwise. */
export function makeTicketChannel(guild: unknown, id = 'chan1'): FakeChannel {
  return {
    id,
    guild,
    client: { user: { id: 'bot' } },
    send: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    setName: vi.fn().mockResolvedValue(undefined),
    permissionOverwrites: {
      edit: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    messages: { fetch: vi.fn().mockResolvedValue(new Map()) },
  };
}

export interface GuildOptions {
  roles?: string[];
  botPermissions?: bigint[];
  /** Channels `guild.channels.fetch` can find, by id. */
  channels?: Record<string, unknown>;
  noBot?: boolean;
}

export interface FakeGuild {
  id: string;
  name: string;
  roles: { cache: Map<string, unknown> };
  channels: { fetch: Mock; create: Mock };
  members: { me: unknown; fetchMe: Mock };
  client: { user: { id: string }; users: { fetch: Mock } };
}

export interface FakeTextDestination {
  id: string;
  type: number;
  isTextBased: () => boolean;
  permissionsFor: Mock;
  send: Mock;
}

/** A guild with a ticket category and a transcript channel the bot may use. */
export function makeGuild(options: GuildOptions = {}): {
  guild: FakeGuild;
  category: { id: string; type: number; permissionsFor: Mock };
  transcripts: FakeTextDestination;
  created: FakeChannel;
} {
  const botMember = options.noBot ? null : { id: 'bot' };
  const category = {
    id: 'cat1',
    type: ChannelType.GuildCategory,
    permissionsFor: vi.fn(() => permissions(options.botPermissions ?? BOT_PERMISSIONS)),
  };
  const transcripts = {
    id: 'transcripts',
    type: ChannelType.GuildText,
    isTextBased: () => true,
    permissionsFor: vi.fn(() => permissions(options.botPermissions ?? BOT_PERMISSIONS)),
    send: vi.fn().mockResolvedValue({}),
  };
  const known: Record<string, unknown> = {
    cat1: category,
    transcripts,
    ...(options.channels ?? {}),
  };
  const created = makeTicketChannel(null, 'chan-new');
  const guild: FakeGuild = {
    id: 'g1',
    name: 'Test Guild',
    roles: { cache: new Map((options.roles ?? ['staff1', 'staff2']).map((r) => [r, {}])) },
    channels: {
      fetch: vi.fn(async (id: string) => known[id] ?? null),
      create: vi.fn().mockResolvedValue(created),
    },
    members: {
      me: botMember,
      fetchMe: vi.fn().mockResolvedValue(null),
    },
    client: {
      user: { id: 'bot' },
      users: {
        fetch: vi.fn(async (id: string) => ({ id, tag: `${id}#0` })),
      },
    },
  };
  created.guild = guild;
  return { guild, category, transcripts, created };
}

export function asTextChannel(channel: FakeChannel): TextChannel {
  return channel as unknown as TextChannel;
}

/** A discord.js-like message for transcript tests. */
export function makeMessage(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: String(1000 + index),
    createdTimestamp: T_OPEN.getTime() + index * 1000,
    author: { id: `u${index % 3}`, tag: `user${index % 3}#0` },
    content: `message ${index}`,
    attachments: new Map(),
    embeds: [],
    ...overrides,
  };
}
