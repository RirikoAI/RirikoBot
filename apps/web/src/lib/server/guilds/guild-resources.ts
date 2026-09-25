import 'server-only';
import type { REST } from '@discordjs/rest';
import {
  ChannelType,
  Routes,
  type APIRole,
  type RESTGetAPIGuildChannelsResult,
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
 * Channels and roles for dashboard pickers, read with the bot token. Callers must have passed
 * `requireGuildAccess(guildId)` first.
 */
export class GuildResourceDirectory {
  private readonly channels: TtlCache<string, RESTGetAPIGuildChannelsResult>;
  private readonly roles: TtlCache<string, RESTGetAPIGuildRolesResult>;

  constructor(
    private readonly rest: Pick<REST, 'get'>,
    now?: () => number,
  ) {
    this.channels = new TtlCache(GUILD_RESOURCES_TTL_MS, now);
    this.roles = new TtlCache(GUILD_RESOURCES_TTL_MS, now);
  }

  /** Text and announcement channels in Discord's sidebar order. */
  async messageChannels(guildId: string): Promise<ChannelOption[]> {
    const channels = await this.channels.get(
      guildId,
      async () =>
        (await this.rest.get(Routes.guildChannels(guildId))) as RESTGetAPIGuildChannelsResult,
    );
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
    const roles = await this.roles.get(
      guildId,
      async () => (await this.rest.get(Routes.guildRoles(guildId))) as RESTGetAPIGuildRolesResult,
    );
    return roles
      .filter((role: APIRole) => role.id !== guildId && !role.managed)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({ id: role.id, name: role.name, color: role.color }));
  }
}
