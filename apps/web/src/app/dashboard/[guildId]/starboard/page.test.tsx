import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elements, render, textOf } from '../../../../../../../tests/support/markup';

const GUILD = '100000000000000001';

const get = vi.fn();
const requireGuildAccess = vi.fn(async (_guildId: string) => ({}));

vi.mock('@/lib/server/guilds/require-guild-access', () => ({
  requireGuildAccess: (guildId: string) => requireGuildAccess(guildId),
}));
vi.mock('@/lib/server/services', () => ({
  getWebServices: async () => ({ guildConfig: { get } }),
}));
vi.mock('@/components/guild-pickers', () => ({
  ChannelListField: (props: { label: string; description: string }) => (
    <p>
      {props.label} {props.description}
    </p>
  ),
  ChannelSelectField: (props: { label: string; description: string; emptyLabel: string }) => (
    <p>
      {props.label} {props.description} {props.emptyLabel}
    </p>
  ),
}));
vi.mock('./actions', () => ({
  saveStarboardSettings: async (_guildId: string, state: unknown) => state,
}));

const { default: StarboardSettingsPage } = await import('./page');

async function page() {
  return render(await StarboardSettingsPage({ params: Promise.resolve({ guildId: GUILD }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({
    channelId: null,
    emoji: '⭐',
    threshold: 3,
    allowSelfStar: false,
    ignoredChannelIds: [],
  });
});

describe('StarboardSettingsPage (TASK-2015)', () => {
  it('checks access, reads the starboard module and shows one form', async () => {
    const html = await page();
    expect(requireGuildAccess).toHaveBeenCalledWith(GUILD);
    expect(get).toHaveBeenCalledWith(GUILD, 'starboard');
    expect(elements(html, 'form')).toHaveLength(1);
    const text = textOf(html);
    expect(text).toContain('Starboard');
    expect(text).toContain('Emoji');
    expect(text).toContain('Stars needed');
    expect(text).toContain("Count the author's own star");
  });

  it('shows the saved emoji and threshold and the author switch state', async () => {
    get.mockResolvedValue({
      channelId: null,
      emoji: '<:pog:123456789012345678>',
      threshold: 7,
      allowSelfStar: true,
      ignoredChannelIds: [],
    });
    const html = await page();
    const inputs = elements(html, 'input');
    expect(inputs.find((i) => i['name'] === 'emoji')?.['value']).toBe('<:pog:123456789012345678>');
    const threshold = inputs.find((i) => i['name'] === 'threshold');
    expect(threshold?.['value']).toBe('7');
    expect(threshold?.['min']).toBe('1');
    expect(threshold?.['max']).toBe('100');
    expect(inputs.find((i) => i['name'] === 'allowSelfStar')?.['checked']).toBeDefined();
  });

  it('explains what is posted, when a copy is removed and the permissions Ririko needs', async () => {
    const text = textOf(await page());
    expect(text).toContain('Ririko posts a copy of it in the starboard channel');
    expect(text).toContain(
      'removes the copy when the original is deleted or its stars fall below the number needed',
    );
    expect(text).toContain('View Channel, Send Messages, Embed Links and Read Message History');
    expect(text).toContain('Up to 25 channels.');
    expect(text).toContain('Starboard channel');
    expect(text).toContain('age-restricted too');
  });
});
