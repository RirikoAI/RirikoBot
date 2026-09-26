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
 * Errors for submitted roles Ririko cannot give, by field. The bot skips such roles, so saving
 * them would silently do nothing.
 */
export async function checkAssignableRoles(
  resources: Resources,
  guildId: string,
  fields: Record<string, unknown>,
): Promise<Record<string, string[]>> {
  const submitted = Object.entries(fields).map(([field, value]) => [field, idsOf(value)] as const);
  if (submitted.every(([, ids]) => ids.length === 0)) return {};

  const [assignable, all] = await Promise.all([
    resources.assignableRoles(guildId),
    resources.memberRoles(guildId),
  ]);
  const allowed = new Set(assignable.map((role) => role.id));
  const names = new Map(all.map((role) => [role.id, role.name]));
  const errors: Record<string, string[]> = {};
  for (const [field, ids] of submitted) {
    for (const id of ids) {
      if (allowed.has(id)) continue;
      const name = names.get(id);
      (errors[field] ??= []).push(
        name === undefined
          ? `Role ${id} no longer exists.`
          : `Ririko cannot give @${name}: it is managed by an integration or is not below Ririko’s highest role.`,
      );
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
