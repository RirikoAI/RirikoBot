import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { hiddenJson, render, textOf } from '../../../../../../../tests/support/markup';

const form = vi.hoisted(() => ({ state: { status: 'idle' } as SettingsFormState }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: () => [form.state, () => undefined, false],
}));

const { SettingsForm } = await import('@/components/settings-form');
const { AutoVoiceHubsField } = await import('./auto-voice-hubs-field');

const noop = async (state: SettingsFormState) => state;
const channels = [
  { value: 'v1', label: 'Lobby' },
  { value: 'v2', label: 'Gaming' },
];

function field(
  defaultValue: Parameters<typeof AutoVoiceHubsField>[0]['defaultValue'],
  maxBitrate = 96_000,
) {
  return render(
    <SettingsForm action={noop}>
      <AutoVoiceHubsField defaultValue={defaultValue} channels={channels} maxBitrate={maxBitrate} />
    </SettingsForm>,
  );
}

describe('AutoVoiceHubsField', () => {
  beforeEach(() => {
    form.state = { status: 'idle' };
  });

  it('submits the saved hubs as JSON in row order', () => {
    const html = field([
      { channelId: 'v1', nameTemplate: "{user}'s Room", userLimit: 4, bitrate: 64_000 },
      { channelId: 'v2', nameTemplate: 'Squad', userLimit: 0, bitrate: 96_000 },
    ]);
    expect(hiddenJson(html, 'hubs')).toEqual([
      { channelId: 'v1', nameTemplate: "{user}'s Room", userLimit: 4, bitrate: 64_000 },
      { channelId: 'v2', nameTemplate: 'Squad', userLimit: 0, bitrate: 96_000 },
    ]);
    expect(textOf(html)).toContain('Row 1');
    expect(textOf(html)).toContain('Row 2');
    expect(textOf(html)).toContain('This server allows up to 96 kbps.');
  });

  it('only offers bitrates the server boost level allows, and marks a saved one above it', () => {
    const html = field(
      [{ channelId: 'v1', nameTemplate: 'A', userLimit: 0, bitrate: 128_000 }],
      64_000,
    );
    expect(html).toContain('>64 kbps</option>');
    expect(html).not.toContain('>96 kbps</option>');
    expect(html).toContain('128 kbps (above this server’s limit)');
  });

  it('does not offer a channel another hub already uses, and labels a deleted channel', () => {
    const html = field([
      { channelId: 'v1', nameTemplate: 'A', userLimit: 0, bitrate: 64_000 },
      { channelId: 'gone', nameTemplate: 'B', userLimit: 0, bitrate: 64_000 },
    ]);
    expect(html).toContain('Deleted channel (gone)');
    // Row 2 can pick v2 (free) but not v1 (row 1's), while row 1 keeps its own.
    const rowTwo = html.split('Row 2')[1]!;
    expect(rowTwo).toContain('>Gaming</option>');
    expect(rowTwo).not.toContain('>Lobby</option>');
  });

  it('explains when there are no hubs', () => {
    const html = field([]);
    expect(textOf(html)).toContain('No hubs: joining a voice channel creates nothing.');
    expect(hiddenJson(html, 'hubs')).toEqual([]);
  });

  it('keeps a blank limit blank and shows the returned errors', () => {
    form.state = {
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { hubs: ['Row 1: Enter a whole number from 0 to 99.'] },
      values: { hubs: [{ channelId: 'v1', nameTemplate: 'A', userLimit: null, bitrate: 64_000 }] },
    };
    const html = field([]);
    expect(hiddenJson(html, 'hubs')).toEqual([
      { channelId: 'v1', nameTemplate: 'A', userLimit: null, bitrate: 64_000 },
    ]);
    expect(textOf(html)).toContain('Row 1: Enter a whole number from 0 to 99.');
  });

  it('falls back to the saved hubs when the returned value is not JSON', () => {
    form.state = { status: 'error', message: 'x', values: { hubs: '{oops' } };
    const html = field([{ channelId: 'v1', nameTemplate: 'A', userLimit: 2, bitrate: 64_000 }]);
    expect(hiddenJson(html, 'hubs')).toEqual([
      { channelId: 'v1', nameTemplate: 'A', userLimit: 2, bitrate: 64_000 },
    ]);
  });
});
