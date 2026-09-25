import 'server-only';
import type { REST } from '@discordjs/rest';
import {
  ChannelType,
  Routes,
  type APIRole,
  type RESTGetAPIGuildChannelsResult,
  type RESTGetAPIGuildResult,
  type RESTGetAPIGuildRolesResult,
} from 'discord-api-types/v10';
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

const MESSAGE_CHANNEL_TYPES = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
]);

/**
 * Channels, roles and member counts for dashboard pages, read with the bot token. Callers must
 * have passed `requireGuildAccess(guildId)` first.
 */
export class GuildResourceDirectory {
  private readonly channels: TtlCache<string, RESTGetAPIGuildChannelsResult>;
  private readonly roles: TtlCache<string, RESTGetAPIGuildRolesResult>;
  private readonly counts: TtlCache<string, GuildCounts>;

  constructor(
    private readonly rest: Pick<REST, 'get'>,
    now?: () => number,
  ) {
    this.channels = new TtlCache(GUILD_RESOURCES_TTL_MS, now);
    this.roles = new TtlCache(GUILD_RESOURCES_TTL_MS, now);
    this.counts = new TtlCache(GUILD_RESOURCES_TTL_MS, now);
  }

  /** Member and online counts (`GET /guilds/{id}?with_counts=true`). */
  async memberCounts(guildId: string): Promise<GuildCounts> {
    return this.counts.get(guildId, async () => {
      const guild = (await this.rest.get(Routes.guild(guildId), {
        query: new URLSearchParams({ with_counts: 'true' }),
      })) as RESTGetAPIGuildResult;
      return {
        members: guild.approximate_member_count ?? 0,
        online: guild.approximate_presence_count ?? 0,
      };
    });
  }

  /** Every channel's name by ID, for showing channels the bot reports by ID. */
  async channelNames(guildId: string): Promise<Map<string, string>> {
    const channels = await this.loadChannels(guildId);
    return new Map(channels.map((channel) => [channel.id, channel.name ?? channel.id]));
  }

  /** Text and announcement channels in Discord's sidebar order. */
  async messageChannels(guildId: string): Promise<ChannelOption[]> {
    const channels = await this.loadChannels(guildId);
    const categories = new Map(
      channels
        .filter((channel) => channel.type === ChannelType.GuildCategory)
        .map((category) => [category.id, category]),
    );
    const position = (channel: object) =>
      'position' in channel && typeof channel.position === 'number' ? channel.position : 0;

    return channels
      .filter((channel) => MESSAGE_CHANNEL_TYPES.has(channel.type))
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

  /** Roles members can be given: excludes @everyone and roles managed by integrations. */
  async assignableRoles(guildId: string): Promise<RoleOption[]> {
    return this.roleOptions(guildId, (role) => !role.managed);
  }

  /**
   * Every role a member can hold, including integration-managed ones such as Server Booster;
   * excludes @everyone. For settings that match members by role, like AutoMod exemptions.
   */
  async memberRoles(guildId: string): Promise<RoleOption[]> {
    return this.roleOptions(guildId, () => true);
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
    const roles = await this.roles.get(
      guildId,
      async () => (await this.rest.get(Routes.guildRoles(guildId))) as RESTGetAPIGuildRolesResult,
    );
    return roles
      .filter((role: APIRole) => role.id !== guildId && include(role))
      .sort((a, b) => b.position - a.position)
      .map((role) => ({ id: role.id, name: role.name, color: role.color }));
  }
}
