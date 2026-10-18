import { describe, expect, it, vi } from 'vitest';
import { elements, hiddenValues, render, textOf } from '../../../../tests/support/markup';

const resources = vi.hoisted(() => ({
  messageChannels: vi.fn(async () => [
    { id: 'c1', name: 'general', category: 'Text' },
    { id: 'c2', name: 'rules', category: null },
  ]),
  voiceChannels: vi.fn(async () => [{ id: 'v1', name: 'Lobby', category: 'Voice' }]),
  assignableRoles: vi.fn(async () => [{ id: 'r1', name: 'Gamer' }]),
  memberRoles: vi.fn(async () => [
    { id: 'r1', name: 'Gamer' },
    { id: 'r2', name: 'Booster' },
  ]),
}));

vi.mock('@/lib/server/services', () => ({
  getWebServices: async () => ({ guildResources: resources }),
}));

const {
  AssignableRoleListField,
  ChannelListField,
  ChannelSelectField,
  MemberRoleSelectField,
  RoleListField,
  RoleSelectField,
} = await import('./guild-pickers');

const base = { guildId: '100000000000000001', name: 'target', label: 'Target' };

describe('guild pickers', () => {
  it('lists text channels under their category with the saved one selected', async () => {
    const html = render(
      await ChannelSelectField({ ...base, defaultValue: 'c2', emptyLabel: 'None' }),
    );
    expect(html).toContain('<option value="">None</option>');
    expect(html).toContain(
      '<optgroup label="Text"><option value="c1">#general</option></optgroup>',
    );
    expect(html).toContain('<option value="c2" selected="">#rules</option>');
    expect(resources.messageChannels).toHaveBeenCalledWith('100000000000000001');
  });

  it('starts with no choice when nothing is saved', async () => {
    const html = render(await ChannelSelectField({ ...base, defaultValue: null }));
    expect(html).not.toContain('selected');
  });

  it('adds voice channels to the channel list only when asked', async () => {
    const without = render(await ChannelListField({ ...base, defaultValue: ['c1'] }));
    expect(textOf(without)).not.toContain('Lobby');
    expect(hiddenValues(without, 'target')).toEqual(['c1']);

    const withVoice = render(
      await ChannelListField({ ...base, defaultValue: [], includeVoice: true }),
    );
    expect(withVoice).toContain('🔊 Lobby');
    expect(withVoice).toContain('Add a channel…');
  });

  it('offers roles Ririko can give, and keeps a saved role it can no longer give, labelled as such', async () => {
    const html = render(await RoleSelectField({ ...base, defaultValue: 'r2' }));
    expect(html).toContain('@Booster (Ririko cannot give it)');
    expect(html).toContain('<option value="r1">@Gamer</option>');
  });

  it('labels a saved role that was deleted', async () => {
    const html = render(await RoleSelectField({ ...base, defaultValue: 'gone' }));
    expect(html).toContain('Deleted role (gone)');
  });

  it('does not touch the role list when every saved role can still be given', async () => {
    resources.memberRoles.mockClear();
    const html = render(await AssignableRoleListField({ ...base, defaultValue: ['r1'] }));
    expect(hiddenValues(html, 'target')).toEqual(['r1']);
    expect(resources.memberRoles).not.toHaveBeenCalled();
  });

  it('shows a saved role that cannot be given as a chip so a save does not clear it', async () => {
    const html = render(await AssignableRoleListField({ ...base, defaultValue: ['r2', 'gone'] }));
    expect(hiddenValues(html, 'target')).toEqual(['r2', 'gone']);
    expect(textOf(html)).toContain('@Booster (Ririko cannot give it)');
    expect(textOf(html)).toContain('Deleted role (gone)');
  });

  it('matches members by any role except @everyone, including managed ones', async () => {
    const select = render(await MemberRoleSelectField({ ...base, defaultValue: 'r2' }));
    expect(select).toContain('<option value="r2" selected="">@Booster</option>');
    const deleted = render(await MemberRoleSelectField({ ...base, defaultValue: 'gone' }));
    expect(deleted).toContain('Deleted role (gone)');
    const list = render(await RoleListField({ ...base, defaultValue: ['r2'] }));
    expect(hiddenValues(list, 'target')).toEqual(['r2']);
    expect(elements(list, 'option').map((option) => option['value'])).toEqual(['', 'r1']);
  });
});
