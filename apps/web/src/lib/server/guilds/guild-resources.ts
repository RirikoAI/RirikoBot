import 'server-only';
import type { REST } from '@discordjs/rest';
import {
  ChannelType,
  GuildFeature,
  PermissionFlagsBits,
  Routes,
  type APIGuildMember,
  type APIRole,
  type APIUser,
  type RESTGetAPIGuildChannelsResult,
  type RESTGetAPIGuildResult,
  type RESTGetAPIGuildRolesResult,
} from 'discord-api-types/v10';
import { voiceBitrateCap } from '@ririko/core';
import { TtlCache } from '../ttl-cache';

export const GUILD_RESOURCES_TTL_MS = 60_000;

export interface ChannelOption {
  id: string;
  name: string;
  /** Category the channel sits in, for grouping in pickers. */
  category: string | null;
}

/** Approximate counts from Discord; `online` counts members who are not offline. */
export interface GuildCounts {
  members: number;
  online: number;
}

export interface RoleOption {
  id: string;
  name: string;
  color: number;
}

/** Ririko's place in a guild's role list, which decides the roles it can give. */
export interface BotRoleContext {
  /** Name of Ririko's highest role; null when it only has @everyone. */
  topRoleName: string | null;
  /** Whether Ririko has Manage Roles (or Administrator). */
  canManageRoles: boolean;
}

const MESSAGE_CHANNEL_TYPES = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
]);
const VOICE_CHANNEL_TYPES = new Set<ChannelType>([ChannelType.GuildVoice]);

/**
 * Channels, roles and member counts for dashboard pages, read with the bot token. Callers must
 * have passed `requireGuildAccess(guildId)` first.
 */
export class GuildResourceDirectory {
  private readonly guilds: TtlCache<string, RESTGetAPIGuildResult>;
  private readonly channels: TtlCache<string, RESTGetAPIGuildChannelsResult>;
  private readonly roles: TtlCache<string, RESTGetAPIGuildRolesResult>;
  private readonly botMembers: TtlCache<string, APIGuildMember>;
  private botUser: Promise<string> | undefined;

  constructor(
    private readonly rest: Pick<REST, 'get'>,
    now?: () => number,
  ) {
    this.guilds = new TtlCache(GUILD_RESOURCES_TTL_MS, now);
    this.channels = new TtlCache(GUILD_RESOURCES_TTL_MS, now);
    this.roles = new TtlCache(GUILD_RESOURCES_TTL_MS, now);
    this.botMembers = new TtlCache(GUILD_RESOURCES_TTL_MS, now);
  }

  /** Member and online counts (`GET /guilds/{id}?with_counts=true`). */
  async memberCounts(guildId: string): Promise<GuildCounts> {
    const guild = await this.loadGuild(guildId);
    return {
      members: guild.approximate_member_count ?? 0,
      online: guild.approximate_presence_count ?? 0,
    };
  }

  /** Highest voice bitrate the guild's boost tier allows, in bits per second. */
  async maxBitrate(guildId: string): Promise<number> {
    const guild = await this.loadGuild(guildId);
    return voiceBitrateCap(guild.premium_tier, guild.features.includes(GuildFeature.VIPRegions));
  }

  /** Every channel's name by ID, for showing channels the bot reports by ID. */
  async channelNames(guildId: string): Promise<Map<string, string>> {
    const channels = await this.loadChannels(guildId);
    return new Map(channels.map((channel) => [channel.id, channel.name ?? channel.id]));
  }

  /** Text and announcement channels in Discord's sidebar order. */
  async messageChannels(guildId: string): Promise<ChannelOption[]> {
    return this.channelOptions(guildId, MESSAGE_CHANNEL_TYPES);
  }

  /** Voice channels in Discord's sidebar order. */
  async voiceChannels(guildId: string): Promise<ChannelOption[]> {
    return this.channelOptions(guildId, VOICE_CHANNEL_TYPES);
  }

  /**
   * Roles Ririko can give members, by the same rule as the bot: not @everyone, not managed by
   * an integration, and strictly below Ririko's highest role.
   */
  async assignableRoles(guildId: string): Promise<RoleOption[]> {
    const { topPosition } = await this.botRoles(guildId);
    return this.roleOptions(guildId, (role) => !role.managed && role.position < topPosition);
  }

  /** Ririko's highest role and whether it may manage roles, for page notes. */
  async botRoleContext(guildId: string): Promise<BotRoleContext> {
    const { top, permissions } = await this.botRoles(guildId);
    const canManageRoles =
      (permissions & (PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageRoles)) !== 0n;
    return { topRoleName: top?.name ?? null, canManageRoles };
  }

  /**
   * Every role a member can hold, including integration-managed ones such as Server Booster;
   * excludes @everyone. For settings that match members by role, like AutoMod exemptions.
   */
  async memberRoles(guildId: string): Promise<RoleOption[]> {
    return this.roleOptions(guildId, () => true);
  }

  private async channelOptions(
    guildId: string,
    types: ReadonlySet<ChannelType>,
  ): Promise<ChannelOption[]> {
    const channels = await this.loadChannels(guildId);
    const categories = new Map(
      channels
        .filter((channel) => channel.type === ChannelType.GuildCategory)
        .map((category) => [category.id, category]),
    );
    const position = (channel: object) =>
      'position' in channel && typeof channel.position === 'number' ? channel.position : 0;

    return channels
      .filter((channel) => types.has(channel.type))
      .map((channel) => ({
        channel,
        category: channel.parent_id ? categories.get(channel.parent_id) : undefined,
      }))
      .sort(
        (a, b) =>
          (a.category ? position(a.category) + 1 : 0) -
            (b.category ? position(b.category) + 1 : 0) ||
          position(a.channel) - position(b.channel),
      )
      .map(({ channel, category }) => ({
        id: channel.id,
        name: channel.name,
        category: category?.name ?? null,
      }));
  }

  /** Ririko's highest role (position 0 when it has none) and its guild-wide permissions. */
  private async botRoles(
    guildId: string,
  ): Promise<{ top: APIRole | null; topPosition: number; permissions: bigint }> {
    const [roles, member] = await Promise.all([
      this.loadRoles(guildId),
      this.loadBotMember(guildId),
    ]);
    let top: APIRole | null = null;
    let permissions = 0n;
    for (const role of roles) {
      const everyone = role.id === guildId;
      if (!everyone && !member.roles.includes(role.id)) continue;
      permissions |= BigInt(role.permissions);
      if (!everyone && (!top || role.position > top.position)) top = role;
    }
    return { top, topPosition: top?.position ?? 0, permissions };
  }

  private loadGuild(guildId: string): Promise<RESTGetAPIGuildResult> {
    return this.guilds.get(
      guildId,
      async () =>
        (await this.rest.get(Routes.guild(guildId), {
          query: new URLSearchParams({ with_counts: 'true' }),
        })) as RESTGetAPIGuildResult,
    );
  }

  private loadRoles(guildId: string): Promise<RESTGetAPIGuildRolesResult> {
    return this.roles.get(
      guildId,
      async () => (await this.rest.get(Routes.guildRoles(guildId))) as RESTGetAPIGuildRolesResult,
    );
  }

  private loadBotMember(guildId: string): Promise<APIGuildMember> {
    return this.botMembers.get(guildId, async () => {
      const botId = await this.botUserId();
      return (await this.rest.get(Routes.guildMember(guildId, botId))) as APIGuildMember;
    });
  }

  /** The bot's own user ID, read once per process (a failed read is retried next time). */
  botUserId(): Promise<string> {
    this.botUser ??= (this.rest.get(Routes.user()) as Promise<APIUser>).then(
      (user) => user.id,
      (error: unknown) => {
        this.botUser = undefined;
        throw error;
      },
    );
    return this.botUser;
  }

  private loadChannels(guildId: string): Promise<RESTGetAPIGuildChannelsResult> {
    return this.channels.get(
      guildId,
      async () =>
        (await this.rest.get(Routes.guildChannels(guildId))) as RESTGetAPIGuildChannelsResult,
    );
  }

  private async roleOptions(
    guildId: string,
    include: (role: APIRole) => boolean,
  ): Promise<RoleOption[]> {
    const roles = await this.loadRoles(guildId);
    return roles
      .filter((role: APIRole) => role.id !== guildId && include(role))
      .sort((a, b) => b.position - a.position)
      .map((role) => ({ id: role.id, name: role.name, color: role.color }));
  }
}
