/** Used when a subscription has no custom message. */
export const DEFAULT_STREAM_TEMPLATE =
  '{role} 🔴 **{streamer}** is now live on **{platform}**!\n<{url}>';

/** Variables a stream announcement template can use, in the order the help text lists them. */
export const STREAM_TEMPLATE_VARIABLES = [
  'streamer',
  'title',
  'game',
  'platform',
  'url',
  'role',
] as const;

/** Longest custom message a subscription can store. */
export const MAX_STREAM_TEMPLATE_LENGTH = 1000;

/** Discord's limit for message content. */
const MAX_MESSAGE_LENGTH = 2000;

export interface StreamAnnouncementValues {
  streamer: string;
  title: string;
  game: string | null;
  platform: string;
  url: string;
  mentionRoleId?: string | null | undefined;
}

const VARIABLE = /\{(streamer|title|game|platform|url|role)\}/gi;

/**
 * The message content for a live announcement. Variables are replaced in one pass, so a stream
 * title that contains `{role}` or `$&` is inserted as written. Line breaks in the template are
 * kept; runs of spaces left by an empty `{role}` are collapsed. Mentions are not escaped here:
 * the sender limits them with `allowedMentions` to the subscription's role.
 */
export function formatStreamAnnouncement(
  template: string | null | undefined,
  values: StreamAnnouncementValues,
): string {
  const raw = template && template.trim().length > 0 ? template : DEFAULT_STREAM_TEMPLATE;
  const replacements: Record<string, string> = {
    streamer: values.streamer,
    title: values.title,
    game: values.game || 'Streaming',
    platform: values.platform,
    url: values.url,
    role: values.mentionRoleId ? `<@&${values.mentionRoleId}>` : '',
  };

  return raw
    .replace(VARIABLE, (_match, name: string) => replacements[name.toLowerCase()] ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

/** Mentions a live announcement may ping: only the subscription's role, never users or @everyone. */
export function streamAnnouncementMentions(mentionRoleId: string | null | undefined): {
  parse: [];
  roles: string[];
} {
  return { parse: [], roles: mentionRoleId ? [mentionRoleId] : [] };
}
