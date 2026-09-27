import 'server-only';
import { z } from 'zod';
import { AutoVoiceHubSchema } from '@ririko/core';
import type { GuildResourceDirectory } from './guild-resources';

type Resources = Pick<
  GuildResourceDirectory,
  'assignableRoles' | 'memberRoles' | 'voiceChannels' | 'maxBitrate'
>;

/** A single ID or a list of IDs as submitted; anything else is left to the schema. */
function idsOf(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() === '' ? [] : [value.trim()];
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * Why Ririko cannot give each of `roleIds`, by role ID; roles it can give are left out. The bot
 * skips such roles, so saving them would silently do nothing.
 */
export async function unassignableRoles(
  resources: Pick<Resources, 'assignableRoles' | 'memberRoles'>,
  guildId: string,
  roleIds: readonly string[],
): Promise<Map<string, string>> {
  const problems = new Map<string, string>();
  if (roleIds.length === 0) return problems;
  const [assignable, all] = await Promise.all([
    resources.assignableRoles(guildId),
    resources.memberRoles(guildId),
  ]);
  const allowed = new Set(assignable.map((role) => role.id));
  const names = new Map(all.map((role) => [role.id, role.name]));
  for (const id of roleIds) {
    if (allowed.has(id)) continue;
    const name = names.get(id);
    problems.set(
      id,
      name === undefined
        ? `Role ${id} no longer exists.`
        : `Ririko cannot give @${name}: it is managed by an integration or is not below Ririko’s highest role.`,
    );
  }
  return problems;
}

/** Errors for submitted roles Ririko cannot give, by field. */
export async function checkAssignableRoles(
  resources: Resources,
  guildId: string,
  fields: Record<string, unknown>,
): Promise<Record<string, string[]>> {
  const submitted = Object.entries(fields).map(([field, value]) => [field, idsOf(value)] as const);
  const problems = await unassignableRoles(
    resources,
    guildId,
    submitted.flatMap(([, ids]) => ids),
  );
  const errors: Record<string, string[]> = {};
  for (const [field, ids] of submitted) {
    for (const id of ids) {
      const problem = problems.get(id);
      if (problem) (errors[field] ??= []).push(problem);
    }
  }
  return errors;
}

/** An error for `field` when it names a channel that is not a text channel of the guild. */
export async function checkMessageChannel(
  resources: Pick<GuildResourceDirectory, 'messageChannels'>,
  guildId: string,
  field: string,
  fields: Record<string, unknown>,
): Promise<Record<string, string[]>> {
  const [channelId] = idsOf(fields[field]);
  if (!channelId) return {};
  const channels = await resources.messageChannels(guildId);
  return channels.some((channel) => channel.id === channelId)
    ? {}
    : { [field]: ['Choose a text channel of this server.'] };
}

/**
 * An error for `field` when its `provider` or `provider/model` value names a provider this
 * bot has no credentials for; the bot would only fall back to another one.
 */
export function checkConfiguredProvider(
  configured: readonly string[],
  labels: Readonly<Record<string, string>>,
  field: string,
  fields: Record<string, unknown>,
): Record<string, string[]> {
  const value = fields[field];
  if (typeof value !== 'string' || value.trim() === '') return {};
  const provider = value.trim().split('/')[0] ?? '';
  if (!(provider in labels) || configured.includes(provider)) return {};
  return { [field]: [`${labels[provider]} is not configured for this bot.`] };
}

/**
 * Errors for a music channel that is not a text channel of the guild, or a DJ role the guild
 * does not have. An empty value (none) is fine.
 */
export async function checkMusicSettings(
  resources: Pick<GuildResourceDirectory, 'messageChannels' | 'memberRoles'>,
  guildId: string,
  fields: Record<string, unknown>,
): Promise<Record<string, string[]>> {
  const [roleId] = idsOf(fields.djRoleId);
  const errors = await checkMessageChannel(resources, guildId, 'musicChannelId', fields);
  if (roleId) {
    const roles = await resources.memberRoles(guildId);
    if (!roles.some((role) => role.id === roleId)) {
      errors.djRoleId = ['Choose a role of this server.'];
    }
  }
  return errors;
}

/**
 * Errors for hubs that are not voice channels of the guild or ask for more bitrate than its
 * boost level allows, numbered by submitted row. Rows the schema rejects are left to it.
 */
export async function checkAutoVoiceHubs(
  resources: Resources,
  guildId: string,
  hubs: unknown,
): Promise<Record<string, string[]>> {
  let rows: unknown = hubs;
  if (typeof hubs === 'string') {
    try {
      rows = JSON.parse(hubs);
    } catch {
      return {};
    }
  }
  const parsed = z.array(AutoVoiceHubSchema).safeParse(rows);
  if (!parsed.success || parsed.data.length === 0) return {};

  const [channels, maxBitrate] = await Promise.all([
    resources.voiceChannels(guildId),
    resources.maxBitrate(guildId),
  ]);
  const voice = new Set(channels.map((channel) => channel.id));
  const errors: string[] = [];
  parsed.data.forEach((hub, index) => {
    if (!voice.has(hub.channelId)) {
      errors.push(`Row ${index + 1}: Choose a voice channel of this server.`);
    }
    if (hub.bitrate > maxBitrate) {
      errors.push(
        `Row ${index + 1}: This server allows up to ${maxBitrate / 1000} kbps at its boost level.`,
      );
    }
  });
  return errors.length > 0 ? { hubs: errors } : {};
}
