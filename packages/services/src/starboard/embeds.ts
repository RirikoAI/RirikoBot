import { EmbedBuilder, type Message } from 'discord.js';

/** Longest description of an embed. */
const DESCRIPTION_MAX = 4096;

/** Longest value of an embed field. */
const FIELD_MAX = 1024;

/** The gold of a star. */
export const STARBOARD_COLOR = 0xffac33;

/** Cuts `text` to `max` characters, ending with an ellipsis when it was longer. */
function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The line above the copy: `⭐ 5 | #general`. */
export function formatStarboardContent(
  emojiText: string,
  count: number,
  channelId: string,
): string {
  return `${emojiText} ${count} | <#${channelId}>`;
}

const IMAGE_NAME = /\.(png|jpe?g|gif|webp|avif)$/i;

interface AttachmentLike {
  name: string;
  contentType?: string | null;
}

function isImage(attachment: AttachmentLike): boolean {
  return attachment.contentType
    ? attachment.contentType.startsWith('image/')
    : IMAGE_NAME.test(attachment.name);
}

/** The first image attachment, else the first embed that carries an image. */
function firstImageUrl(message: Message): string | null {
  for (const attachment of message.attachments.values()) {
    if (isImage(attachment)) return attachment.url;
  }
  for (const embed of message.embeds) {
    const url =
      embed.image?.url ??
      (embed.data.type === 'image' || embed.data.type === 'gifv' ? embed.thumbnail?.url : null);
    if (url) return url;
  }
  return null;
}

/**
 * The copy of a starred message: the author, the content cut to fit, the first image, the names of
 * the other attachments, and the source channel with a jump link. The count and the emoji are not
 * in the embed; they are in the message content (`formatStarboardContent`) so an edit changes only
 * that.
 */
export function buildStarboardEmbed(message: Message): EmbedBuilder {
  const author = message.author;
  const embed = new EmbedBuilder()
    .setColor(STARBOARD_COLOR)
    .setAuthor({
      name: message.member?.displayName ?? author.displayName,
      iconURL: author.displayAvatarURL(),
    })
    .setTimestamp(message.createdTimestamp);

  if (message.content) embed.setDescription(cut(message.content, DESCRIPTION_MAX));

  const imageUrl = firstImageUrl(message);
  if (imageUrl) embed.setImage(imageUrl);

  const others = [...message.attachments.values()]
    .filter((attachment) => !(imageUrl !== null && attachment.url === imageUrl))
    .map((attachment) => attachment.name);
  if (others.length > 0) {
    embed.addFields({ name: 'Attachments', value: cut(others.join('\n'), FIELD_MAX) });
  }

  embed.addFields({
    name: 'Source',
    value: `<#${message.channelId}> · [Jump to message](${message.url})`,
  });
  return embed;
}
