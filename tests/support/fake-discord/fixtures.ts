/**
 * Fixture model for the fake Discord API, and serializers that turn it into Discord API v10
 * payloads. The bot harness builds its READY and GUILD_CREATE gateway packets from the same
 * fixture the fake HTTP API serves, so REST answers and gateway state always agree.
 *
 * Dependency-free on purpose: the Playwright suite in apps/web and the bot integration suite
 * both import this module, and neither shares a node_modules with the other.
 */

export const Permission = {
  CreateInstantInvite: 1n << 0n,
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  ManageGuild: 1n << 5n,
  AddReactions: 1n << 6n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  ManageMessages: 1n << 13n,
  EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n,
  ReadMessageHistory: 1n << 16n,
  UseExternalEmojis: 1n << 18n,
  Connect: 1n << 20n,
  Speak: 1n << 21n,
  ManageRoles: 1n << 28n,
  ModerateMembers: 1n << 40n,
} as const;

/** Every permission bit Discord defines today; owners and administrators get all of them. */
export const ALL_PERMISSIONS = (1n << 51n) - 1n;

export const ChannelType = { GuildText: 0, DM: 1, GuildVoice: 2, GuildCategory: 4 } as const;

export interface FakeUser {
  id: string;
  username: string;
  globalName?: string;
  bot?: boolean;
}

export interface FakeRole {
  id: string;
  name: string;
  permissions: bigint;
  position: number;
  managed?: boolean;
  color?: number;
}

export interface FakeChannel {
  id: string;
  name: string;
  type: number;
  position?: number;
  parentId?: string;
  topic?: string;
}

export interface FakeMember {
  userId: string;
  roleIds: string[];
  nick?: string;
}

export interface FakeGuild {
  id: string;
  name: string;
  ownerId: string;
  /** Must include the @everyone role, whose id equals the guild id. */
  roles: FakeRole[];
  channels: FakeChannel[];
  members: FakeMember[];
}

export interface FakeDiscordFixture {
  /** The OAuth2 client id and the application id interactions and commands belong to. */
  applicationId: string;
  bot: FakeUser;
  users: FakeUser[];
  guilds: FakeGuild[];
}

/** Stable ids of the default fixture, for assertions. */
export const ids = {
  application: '900000000000000001',
  bot: '900000000000000001',
  admin: '100000000000000001',
  member: '100000000000000002',
  outsider: '100000000000000003',
  mainGuild: '200000000000000001',
  otherGuild: '200000000000000002',
  moderatorRole: '400000000000000001',
  botRole: '400000000000000002',
  otherBotRole: '400000000000000003',
  generalChannel: '300000000000000001',
  aiChannel: '300000000000000002',
  voiceChannel: '300000000000000003',
  otherGeneralChannel: '300000000000000004',
} as const;

const EVERYONE_PERMISSIONS =
  Permission.ViewChannel |
  Permission.SendMessages |
  Permission.ReadMessageHistory |
  Permission.AddReactions |
  Permission.EmbedLinks |
  Permission.AttachFiles |
  Permission.UseExternalEmojis |
  Permission.Connect |
  Permission.Speak;

/**
 * Two guilds the bot is in:
 * - `mainGuild` is owned by `admin`; `member` has only @everyone permissions.
 * - `otherGuild` is owned by `outsider`; `admin` is a plain member there without Manage Server.
 */
export function defaultFixture(): FakeDiscordFixture {
  return {
    applicationId: ids.application,
    bot: { id: ids.bot, username: 'Ririko', bot: true },
    users: [
      { id: ids.admin, username: 'admin', globalName: 'Admin' },
      { id: ids.member, username: 'member', globalName: 'Member' },
      { id: ids.outsider, username: 'outsider', globalName: 'Outsider' },
    ],
    guilds: [
      {
        id: ids.mainGuild,
        name: 'Ririko Test Server',
        ownerId: ids.admin,
        roles: [
          { id: ids.mainGuild, name: '@everyone', permissions: EVERYONE_PERMISSIONS, position: 0 },
          {
            id: ids.moderatorRole,
            name: 'Moderators',
            permissions:
              Permission.KickMembers | Permission.BanMembers | Permission.ModerateMembers,
            position: 1,
          },
          {
            id: ids.botRole,
            name: 'Ririko',
            permissions: Permission.Administrator,
            position: 2,
            managed: true,
          },
        ],
        channels: [
          { id: ids.generalChannel, name: 'general', type: ChannelType.GuildText, position: 0 },
          { id: ids.aiChannel, name: 'ririko-ai', type: ChannelType.GuildText, position: 1 },
          { id: ids.voiceChannel, name: 'Lounge', type: ChannelType.GuildVoice, position: 2 },
        ],
        members: [
          { userId: ids.admin, roleIds: [] },
          { userId: ids.member, roleIds: [] },
          { userId: ids.bot, roleIds: [ids.botRole] },
        ],
      },
      {
        id: ids.otherGuild,
        name: 'Other Server',
        ownerId: ids.outsider,
        roles: [
          { id: ids.otherGuild, name: '@everyone', permissions: EVERYONE_PERMISSIONS, position: 0 },
          {
            id: ids.otherBotRole,
            name: 'Ririko',
            permissions: Permission.Administrator,
            position: 1,
            managed: true,
          },
        ],
        channels: [
          {
            id: ids.otherGeneralChannel,
            name: 'general',
            type: ChannelType.GuildText,
            position: 0,
          },
        ],
        members: [
          { userId: ids.outsider, roleIds: [] },
          { userId: ids.admin, roleIds: [] },
          { userId: ids.bot, roleIds: [ids.otherBotRole] },
        ],
      },
    ],
  };
}

export function findUser(fixture: FakeDiscordFixture, id: string): FakeUser | undefined {
  if (fixture.bot.id === id) return fixture.bot;
  return fixture.users.find((u) => u.id === id);
}

export function findGuild(fixture: FakeDiscordFixture, id: string): FakeGuild | undefined {
  return fixture.guilds.find((g) => g.id === id);
}

export function findChannel(
  fixture: FakeDiscordFixture,
  id: string,
): { guild: FakeGuild; channel: FakeChannel } | undefined {
  for (const guild of fixture.guilds) {
    const channel = guild.channels.find((c) => c.id === id);
    if (channel) return { guild, channel };
  }
  return undefined;
}

/** Guild-level permissions (no channel overwrites), as Discord computes them. */
export function memberPermissions(guild: FakeGuild, userId: string): bigint {
  if (guild.ownerId === userId) return ALL_PERMISSIONS;
  const member = guild.members.find((m) => m.userId === userId);
  if (!member) return 0n;
  let permissions = guild.roles.find((r) => r.id === guild.id)?.permissions ?? 0n;
  for (const roleId of member.roleIds) {
    permissions |= guild.roles.find((r) => r.id === roleId)?.permissions ?? 0n;
  }
  return permissions & Permission.Administrator ? ALL_PERMISSIONS : permissions;
}

export function apiUser(user: FakeUser) {
  return {
    id: user.id,
    username: user.username,
    global_name: user.globalName ?? null,
    discriminator: '0',
    avatar: null,
    bot: user.bot ?? false,
    public_flags: 0,
  };
}

export function apiRole(role: FakeRole) {
  return {
    id: role.id,
    name: role.name,
    color: role.color ?? 0,
    colors: { primary_color: role.color ?? 0, secondary_color: null, tertiary_color: null },
    hoist: false,
    icon: null,
    unicode_emoji: null,
    position: role.position,
    permissions: role.permissions.toString(),
    managed: role.managed ?? false,
    mentionable: false,
    flags: 0,
  };
}

export function apiChannel(channel: FakeChannel, guildId: string) {
  return {
    id: channel.id,
    type: channel.type,
    guild_id: guildId,
    name: channel.name,
    position: channel.position ?? 0,
    parent_id: channel.parentId ?? null,
    permission_overwrites: [],
    topic: channel.topic ?? null,
    nsfw: false,
    rate_limit_per_user: 0,
    last_message_id: null,
    ...(channel.type === ChannelType.GuildVoice
      ? { bitrate: 64000, user_limit: 0, rtc_region: null }
      : {}),
  };
}

export function apiMember(fixture: FakeDiscordFixture, member: FakeMember) {
  const user = findUser(fixture, member.userId);
  if (!user) throw new Error(`Fixture member ${member.userId} has no user`);
  return {
    user: apiUser(user),
    nick: member.nick ?? null,
    avatar: null,
    banner: null,
    roles: member.roleIds,
    joined_at: '2026-01-01T00:00:00.000Z',
    premium_since: null,
    deaf: false,
    mute: false,
    flags: 0,
    pending: false,
    communication_disabled_until: null,
  };
}

export function apiGuild(guild: FakeGuild) {
  return {
    id: guild.id,
    name: guild.name,
    icon: null,
    splash: null,
    discovery_splash: null,
    banner: null,
    description: null,
    owner_id: guild.ownerId,
    afk_channel_id: null,
    afk_timeout: 300,
    verification_level: 0,
    default_message_notifications: 0,
    explicit_content_filter: 0,
    roles: guild.roles.map(apiRole),
    emojis: [],
    stickers: [],
    features: [],
    mfa_level: 0,
    application_id: null,
    system_channel_id: null,
    system_channel_flags: 0,
    rules_channel_id: null,
    public_updates_channel_id: null,
    safety_alerts_channel_id: null,
    vanity_url_code: null,
    premium_tier: 0,
    premium_subscription_count: 0,
    preferred_locale: 'en-US',
    nsfw_level: 0,
    premium_progress_bar_enabled: false,
    max_members: 500000,
    approximate_member_count: guild.members.length,
    approximate_presence_count: guild.members.length,
  };
}

/** The partial guild `GET /users/@me/guilds` returns for a user or the bot. */
export function apiPartialGuild(guild: FakeGuild, userId: string) {
  return {
    id: guild.id,
    name: guild.name,
    icon: null,
    banner: null,
    owner: guild.ownerId === userId,
    permissions: memberPermissions(guild, userId).toString(),
    features: [],
  };
}

/** Gateway GUILD_CREATE payload for a guild, with its channels and members. */
export function gatewayGuildCreate(fixture: FakeDiscordFixture, guild: FakeGuild) {
  return {
    ...apiGuild(guild),
    joined_at: '2026-01-01T00:00:00.000Z',
    large: false,
    unavailable: false,
    member_count: guild.members.length,
    voice_states: [],
    members: guild.members.map((m) => apiMember(fixture, m)),
    channels: guild.channels.map((c) => apiChannel(c, guild.id)),
    threads: [],
    presences: [],
    stage_instances: [],
    guild_scheduled_events: [],
    soundboard_sounds: [],
  };
}

/** Deep copy, so a server can reset to its starting fixture after tests mutate it. */
export function cloneFixture(fixture: FakeDiscordFixture): FakeDiscordFixture {
  return {
    applicationId: fixture.applicationId,
    bot: { ...fixture.bot },
    users: fixture.users.map((u) => ({ ...u })),
    guilds: fixture.guilds.map((g) => ({
      ...g,
      roles: g.roles.map((r) => ({ ...r })),
      channels: g.channels.map((c) => ({ ...c })),
      members: g.members.map((m) => ({ ...m, roleIds: [...m.roleIds] })),
    })),
  };
}
