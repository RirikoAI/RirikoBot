import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { hiddenJson, render, textOf } from '../../../../../../../tests/support/markup';

const form = vi.hoisted(() => ({ state: { status: 'idle' } as SettingsFormState }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: () => [form.state, () => undefined, false],
}));

const { SettingsForm } = await import('@/components/settings-form');
const { CommandOverridesField } = await import('./command-overrides-field');

const noop = async (state: SettingsFormState) => state;
const catalog = [
  {
    name: 'ban',
    category: 'moderation',
    description: 'Ban a member.',
    cooldownSeconds: 0,
    defaultPermission: 'BanMembers,KickMembers',
  },
  {
    name: 'play',
    category: 'music',
    description: 'Play a song.',
    cooldownSeconds: 3,
    defaultPermission: null,
  },
  {
    name: 'daily',
    category: 'economy',
    description: 'Claim credits.',
    cooldownSeconds: 86400,
    defaultPermission: null,
  },
  {
    name: 'odd',
    category: 'experimental',
    description: 'Unknown category.',
    cooldownSeconds: 0,
    defaultPermission: null,
  },
];
const roles = [{ value: 'r1', label: '@Mods' }];
const channels = [
  { value: 'c1', label: '#general' },
  { value: 'c2', label: '#bots' },
];

function field(defaultValue: Parameters<typeof CommandOverridesField>[0]['defaultValue']) {
  return render(
    <SettingsForm action={noop}>
      <CommandOverridesField
        defaultValue={defaultValue}
        catalog={catalog}
        roles={roles}
        channels={channels}
      />
    </SettingsForm>,
  );
}

describe('CommandOverridesField', () => {
  beforeEach(() => {
    form.state = { status: 'idle' };
  });

  it('submits only the rules that change something, and sections commands by category', () => {
    const html = field([
      {
        command: 'ban',
        channelId: null,
        enabled: false,
        allowedRoleIds: [],
        blockedRoleIds: [],
        cooldownSeconds: null,
      },
      // Switched on, no roles, no cooldown: the same as no rule, so it is not submitted.
      {
        command: 'play',
        channelId: null,
        enabled: true,
        allowedRoleIds: [],
        blockedRoleIds: [],
        cooldownSeconds: null,
      },
      {
        command: 'daily',
        channelId: 'c2',
        enabled: true,
        allowedRoleIds: ['r1'],
        blockedRoleIds: [],
        cooldownSeconds: 60,
      },
    ]);
    expect(hiddenJson(html, 'overrides')).toEqual([
      {
        command: 'ban',
        channelId: null,
        enabled: false,
        allowedRoleIds: [],
        blockedRoleIds: [],
        cooldownSeconds: null,
      },
      {
        command: 'daily',
        channelId: 'c2',
        enabled: true,
        allowedRoleIds: ['r1'],
        blockedRoleIds: [],
        cooldownSeconds: 60,
      },
    ]);
    const text = textOf(html);
    expect(text).toContain('Moderation · 1 command, 1 with rules');
    expect(text).toContain('Music · 1 command');
    expect(text).not.toContain('Music · 1 command, ');
    expect(text).toContain('Economy · 1 command, 1 with rules');
    // A category the labels do not know keeps its own name.
    expect(text).toContain('experimental · 1 command');
  });

  it('shows each command with its own cooldown and the permissions it needs', () => {
    const text = textOf(field([]));
    expect(text).toContain('Own cooldown: none · Also needs BanMembers, KickMembers');
    expect(text).toContain('Own cooldown: 3s');
    expect(text).toContain('Own cooldown: 86400s');
    expect(text).toContain('Add server-wide rule');
  });

  it('summarises a command that is off server wide and has channel rules, naming a deleted channel', () => {
    const html = field([
      {
        command: 'ban',
        channelId: null,
        enabled: false,
        allowedRoleIds: [],
        blockedRoleIds: [],
        cooldownSeconds: null,
      },
      {
        command: 'ban',
        channelId: 'c1',
        enabled: false,
        allowedRoleIds: [],
        blockedRoleIds: [],
        cooldownSeconds: null,
      },
      {
        command: 'ban',
        channelId: 'gone',
        enabled: false,
        allowedRoleIds: [],
        blockedRoleIds: [],
        cooldownSeconds: null,
      },
    ]);
    const text = textOf(html);
    expect(text).toContain('off server wide · 2 channel rule(s)');
    expect(text).toContain('Server wide');
    expect(text).toContain('In #general');
    expect(text).toContain('In unknown channel (gone)');
    // The server-wide rule exists, so only channel rules can still be added.
    expect(html.split('Server wide')[1]).toBeDefined();
  });

  it('numbers errors by the submitted rules and opens sections that have rules after a failed save', () => {
    form.state = {
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { overrides: ['Row 1: Enter a whole number of seconds.'] },
      values: {
        overrides: JSON.stringify([
          {
            command: 'ban',
            channelId: null,
            enabled: true,
            allowedRoleIds: [],
            blockedRoleIds: [],
            cooldownSeconds: 'soon',
          },
        ]),
      },
    };
    const html = field([]);
    expect(hiddenJson(html, 'overrides')).toEqual([
      {
        command: 'ban',
        channelId: null,
        enabled: true,
        allowedRoleIds: [],
        blockedRoleIds: [],
        cooldownSeconds: 'soon',
      },
    ]);
    expect(textOf(html)).toContain('Row 1: Enter a whole number of seconds.');
    // Only the section with a rule starts open.
    expect(html.match(/<details[^>]*open/g)).toHaveLength(1);
  });

  it('keeps sections closed when nothing failed, and falls back to the saved rules for unreadable input', () => {
    form.state = { status: 'error', message: 'x', values: { overrides: 'oops' } };
    const html = field([
      {
        command: 'play',
        channelId: null,
        enabled: false,
        allowedRoleIds: [],
        blockedRoleIds: [],
        cooldownSeconds: null,
      },
    ]);
    expect(html.match(/<details[^>]*open/g)).toBeNull();
    expect(hiddenJson(html, 'overrides')).toEqual([
      {
        command: 'play',
        channelId: null,
        enabled: false,
        allowedRoleIds: [],
        blockedRoleIds: [],
        cooldownSeconds: null,
      },
    ]);
  });
});
