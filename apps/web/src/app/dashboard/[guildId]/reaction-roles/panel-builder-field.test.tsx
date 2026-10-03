import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { hiddenJson, render, textOf } from '../../../../../../../tests/support/markup';

const form = vi.hoisted(() => ({ state: { status: 'idle' } as SettingsFormState }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: () => [form.state, () => undefined, false],
}));

const { SettingsForm } = await import('@/components/settings-form');
const { PanelBuilderField } = await import('./panel-builder-field');

const noop = async (state: SettingsFormState) => state;
const channels = [
  { value: 'c1', label: '#roles' },
  { value: 'c2', label: '#news' },
];
const roles = [
  { value: 'r1', label: '@Gamer' },
  { value: 'r2', label: '@Artist' },
];

function field(defaultValue: Parameters<typeof PanelBuilderField>[0]['defaultValue']) {
  return render(
    <SettingsForm action={noop}>
      <PanelBuilderField defaultValue={defaultValue} channels={channels} roles={roles} />
    </SettingsForm>,
  );
}

describe('PanelBuilderField', () => {
  beforeEach(() => {
    form.state = { status: 'idle' };
  });

  it('starts a new panel in the first channel with one empty button row', () => {
    const html = field(null);
    expect(hiddenJson(html, 'panel')).toEqual({
      channelId: 'c1',
      messageId: null,
      content: '',
      embed: null,
      kind: 'BUTTONS',
      mode: 'TOGGLE',
      placeholder: '',
      maxValues: 1,
      items: [{ roleId: '', label: '', description: '', emoji: null, style: 'PRIMARY' }],
    });
    const text = textOf(html);
    expect(text).toContain('Role 1');
    expect(text).toContain('Toggle: click to get the role, click again to lose it');
    expect(text).not.toContain('Editing message');
    expect(text).not.toContain('Embed title');
  });

  it('shows a published panel as editable, locked to its message and channel, with its embed colour', () => {
    const html = field({
      channelId: 'c2',
      messageId: '987654321',
      content: 'Pick your roles',
      embed: { title: 'Roles', description: 'Choose', color: 0xe91e63 },
      kind: 'BUTTONS',
      mode: 'UNIQUE',
      items: [{ roleId: 'r1', label: 'Gamer', emoji: '🎮', style: 'SUCCESS' }],
    });
    expect(hiddenJson(html, 'panel')).toEqual({
      channelId: 'c2',
      messageId: '987654321',
      content: 'Pick your roles',
      embed: { title: 'Roles', description: 'Choose', color: 0xe91e63 },
      kind: 'BUTTONS',
      mode: 'UNIQUE',
      placeholder: '',
      maxValues: 1,
      items: [{ roleId: 'r1', label: 'Gamer', description: '', emoji: '🎮', style: 'SUCCESS' }],
    });
    const text = textOf(html);
    expect(text).toContain('Editing message 987654321 .');
    expect(text).toContain('Start a new panel instead');
    expect(text).toContain('Embed title');
    expect(html).toMatch(/<select[^>]*disabled/);
    expect(html).toContain('value="#e91e63"');
  });

  it('shows the menu options for a drop-down panel: placeholder, how many roles, and role descriptions', () => {
    const html = field({
      channelId: 'c1',
      kind: 'SELECT',
      placeholder: 'Choose',
      maxValues: null,
      items: [
        { roleId: 'r1', label: 'Gamer', description: 'Plays games', emoji: null },
        { roleId: 'r2', label: 'Artist', description: 'Draws', emoji: null },
      ],
    });
    const json = hiddenJson(html, 'panel') as { maxValues: unknown; items: unknown[] };
    expect(json.maxValues).toBeNull();
    expect(json.items).toHaveLength(2);
    const text = textOf(html);
    expect(text).toContain('Roles a member can hold');
    expect(text).toContain('Description');
    expect(text).toContain('removed. With 1, the menu works as “pick one”.');
    expect(text).not.toContain('A click');
    expect(html).toMatch(/<input[^>]*value="Choose"/);
  });

  it('offers each role once and labels a saved role that no longer exists', () => {
    const html = field({
      channelId: 'c1',
      items: [
        { roleId: 'r1', label: 'Gamer' },
        { roleId: 'deleted', label: 'Old' },
      ],
    });
    const rowTwo = html.split('Role 2')[1]!;
    expect(rowTwo).toContain('Unknown role (deleted)');
    expect(rowTwo).toContain('>@Artist</option>');
    expect(rowTwo).not.toContain('>@Gamer</option>');
  });

  it('shows what the last publish returned, with the error lines for the roles', () => {
    form.state = {
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { panel: ['Role 1: Choose a role.'] },
      values: {
        panel: JSON.stringify({ channelId: 'c2', items: [{ roleId: '', label: 'Typed' }] }),
      },
    };
    const html = field({ channelId: 'c1', items: [{ roleId: 'r1', label: 'Saved' }] });
    const json = hiddenJson(html, 'panel') as {
      channelId: string;
      items: Array<{ label: string }>;
    };
    expect(json.channelId).toBe('c2');
    expect(json.items[0]!.label).toBe('Typed');
    expect(textOf(html)).toContain('Role 1: Choose a role.');
  });

  it('falls back to the saved panel when the returned value is not JSON or not a string', () => {
    form.state = { status: 'error', message: 'x', values: { panel: '{broken' } };
    const html = field({ channelId: 'c2', items: [{ roleId: 'r2', label: 'Saved' }] });
    expect((hiddenJson(html, 'panel') as { channelId: string }).channelId).toBe('c2');
  });
});
