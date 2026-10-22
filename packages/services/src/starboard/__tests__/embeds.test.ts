import { Collection, type Message } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { STARBOARD_COLOR, buildStarboardEmbed, formatStarboardContent } from '../embeds.js';
import { fake, makeGuild, makeMessage } from './fixtures.js';

type Attachment = { name: string; url: string; contentType?: string | null };

function attachments(...items: Attachment[]) {
  return new Collection(items.map((item, index) => [String(index), item] as const));
}

function build(overrides: Record<string, unknown> = {}) {
  const message = makeMessage(makeGuild([]), [], overrides);
  return buildStarboardEmbed(fake<Message>(message)).toJSON();
}

describe('formatStarboardContent', () => {
  it('writes the emoji, the count and the source channel', () => {
    expect(formatStarboardContent('⭐', 5, 'c1')).toBe('⭐ 5 | <#c1>');
    expect(formatStarboardContent('<:heart:123456789012345678>', 12, 'c9')).toBe(
      '<:heart:123456789012345678> 12 | <#c9>',
    );
  });
});

describe('buildStarboardEmbed', () => {
  it('shows the author, the content, the time and a jump link to the source', () => {
    const embed = build();
    expect(embed.color).toBe(STARBOARD_COLOR);
    expect(embed.author).toEqual({
      name: 'User author',
      icon_url: 'https://cdn.example/author.png',
    });
    expect(embed.description).toBe('a message worth a star');
    expect(embed.timestamp).toBeDefined();
    expect(embed.image).toBeUndefined();
    expect(embed.fields).toEqual([
      { name: 'Source', value: '<#c1> · [Jump to message](https://discord.com/channels/g1/c1/m1)' },
    ]);
  });

  it('prefers the server nickname over the account name', () => {
    expect(build({ member: { displayName: 'Nick' } }).author?.name).toBe('Nick');
  });

  it('cuts long content to the embed limit', () => {
    const description = build({ content: 'x'.repeat(5000) }).description as string;
    expect(description).toHaveLength(4096);
    expect(description.endsWith('…')).toBe(true);
  });

  it('leaves the description out of a message with no text', () => {
    expect(build({ content: '' }).description).toBeUndefined();
  });

  it('uses the first image attachment as the image and lists the others by name', () => {
    const embed = build({
      attachments: attachments(
        { name: 'notes.pdf', url: 'https://cdn.example/notes.pdf', contentType: 'application/pdf' },
        { name: 'cat.png', url: 'https://cdn.example/cat.png', contentType: 'image/png' },
        { name: 'dog.png', url: 'https://cdn.example/dog.png', contentType: 'image/png' },
      ),
    });
    expect(embed.image?.url).toBe('https://cdn.example/cat.png');
    expect(embed.fields?.[0]).toEqual({ name: 'Attachments', value: 'notes.pdf\ndog.png' });
  });

  it('tells an image by its file name when Discord sent no content type', () => {
    const embed = build({
      attachments: attachments({ name: 'Photo.JPG', url: 'https://cdn.example/Photo.JPG' }),
    });
    expect(embed.image?.url).toBe('https://cdn.example/Photo.JPG');
    expect(embed.fields?.map((field) => field.name)).toEqual(['Source']);
  });

  it('lists an attachment without a known image type', () => {
    const embed = build({
      attachments: attachments({ name: 'data.bin', url: 'https://cdn.example/data.bin' }),
    });
    expect(embed.image).toBeUndefined();
    expect(embed.fields?.[0]?.value).toBe('data.bin');
  });

  it('uses the image of a message embed when no attachment is an image', () => {
    const embed = build({
      embeds: [
        { image: null, thumbnail: null, data: { type: 'rich' } },
        { image: { url: 'https://img.example/a.png' }, thumbnail: null, data: { type: 'rich' } },
      ],
    });
    expect(embed.image?.url).toBe('https://img.example/a.png');
  });

  it('uses the thumbnail of an image or gif embed', () => {
    const embed = build({
      embeds: [
        { image: null, thumbnail: { url: 'https://img.example/t.gif' }, data: { type: 'gifv' } },
      ],
    });
    expect(embed.image?.url).toBe('https://img.example/t.gif');
    const link = build({
      embeds: [
        { image: null, thumbnail: { url: 'https://img.example/x.png' }, data: { type: 'link' } },
      ],
    });
    expect(link.image).toBeUndefined();
  });

  it('prefers an image attachment to a message embed', () => {
    const embed = build({
      attachments: attachments({
        name: 'cat.png',
        url: 'https://cdn.example/cat.png',
        contentType: 'image/png',
      }),
      embeds: [{ image: { url: 'https://img.example/a.png' }, thumbnail: null, data: {} }],
    });
    expect(embed.image?.url).toBe('https://cdn.example/cat.png');
  });

  it('cuts a very long attachment list to the field limit', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      name: `a-very-long-attachment-name-${index}.txt`,
      url: `https://cdn.example/${index}.txt`,
    }));
    const value = build({ attachments: attachments(...many) }).fields?.[0]?.value as string;
    expect(value.length).toBeLessThanOrEqual(1024);
    expect(value.endsWith('…')).toBe(true);
  });
});
