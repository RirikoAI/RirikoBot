import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { elements, hiddenJson, render, textOf } from '../../../../../../../tests/support/markup';

const form = vi.hoisted(() => ({ state: { status: 'idle' } as SettingsFormState }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: () => [form.state, () => undefined, false],
}));

const { SettingsForm } = await import('@/components/settings-form');
const { LevelRewardsField, addRow, removeRow, toJson, toRow, updateRow } =
  await import('./level-rewards-field');

const noop = async (state: SettingsFormState) => state;
const roles = [
  { value: 'r1', label: '@Regular' },
  { value: 'r2', label: '@Veteran' },
];

function field(defaultValue: Parameters<typeof LevelRewardsField>[0]['defaultValue']) {
  return render(
    <SettingsForm action={noop}>
      <LevelRewardsField defaultValue={defaultValue} roles={roles} maxRewards={3} maxLevel={1000} />
    </SettingsForm>,
  );
}

describe('LevelRewardsField', () => {
  beforeEach(() => {
    form.state = { status: 'idle' };
  });

  it('submits the saved rewards as JSON in row order', () => {
    const html = field([
      { level: 5, roleId: 'r1' },
      { level: 20, roleId: 'r2' },
    ]);
    expect(hiddenJson(html, 'rewards')).toEqual([
      { level: 5, roleId: 'r1' },
      { level: 20, roleId: 'r2' },
    ]);
    expect(textOf(html)).toContain('Row 1');
    expect(textOf(html)).toContain('Row 2');
    expect(textOf(html)).toContain('Up to 3 rewards.');
    expect(elements(html, 'input').filter((input) => input['type'] === 'number')).toEqual([
      expect.objectContaining({ min: '1', max: '1000', value: '5' }),
      expect.objectContaining({ min: '1', max: '1000', value: '20' }),
    ]);
  });

  it('does not offer a role another row uses, and labels one that is no longer available', () => {
    const html = field([
      { level: 5, roleId: 'r1' },
      { level: 10, roleId: 'gone' },
    ]);
    expect(html).toContain('Unavailable role (gone)');
    // Row 2 can pick r2 (free) but not r1 (row 1's), while row 1 keeps its own.
    const rowTwo = html.split('Row 2')[1]!;
    expect(rowTwo).toContain('>@Veteran</option>');
    expect(rowTwo).not.toContain('>@Regular</option>');
    expect(html.split('Row 2')[0]).toContain('>@Regular</option>');
  });

  it('explains when there are no rewards, and offers the add button', () => {
    const html = field([]);
    expect(textOf(html)).toContain('No rewards: no roles are given for levels.');
    expect(hiddenJson(html, 'rewards')).toEqual([]);
    expect(html).toContain('Add reward');
    expect(elements(html, 'button').some((button) => 'disabled' in button)).toBe(false);
  });

  it('disables the add button at the limit', () => {
    const html = field([
      { level: 1, roleId: 'a' },
      { level: 2, roleId: 'b' },
      { level: 3, roleId: 'c' },
    ]);
    expect(elements(html, 'button').filter((button) => 'disabled' in button)).toHaveLength(1);
    expect(html).toContain('aria-label="Remove row 3"');
  });

  it('keeps a blank level blank and shows the returned errors', () => {
    form.state = {
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { rewards: ['Row 1: Level must be a whole number from 1 to 1000.'] },
      values: { rewards: [{ level: null, roleId: 'r1' }, { roleId: null }] },
    };
    const html = field([]);
    expect(hiddenJson(html, 'rewards')).toEqual([
      { level: null, roleId: 'r1' },
      { level: null, roleId: '' },
    ]);
    expect(textOf(html)).toContain('Row 1: Level must be a whole number from 1 to 1000.');
  });

  it('reads the returned rows from a JSON string, and falls back when it is not JSON', () => {
    form.state = {
      status: 'error',
      message: 'x',
      values: { rewards: JSON.stringify([{ level: 7, roleId: 'r2' }]) },
    };
    expect(hiddenJson(field([]), 'rewards')).toEqual([{ level: 7, roleId: 'r2' }]);
    form.state = { status: 'error', message: 'x', values: { rewards: '{oops' } };
    expect(hiddenJson(field([{ level: 2, roleId: 'r1' }]), 'rewards')).toEqual([
      { level: 2, roleId: 'r1' },
    ]);
  });
});

describe('row editing', () => {
  it('adds a blank row, removes one by key and edits one by key', () => {
    let rows = [toRow({ level: 5, roleId: 'r1' })];
    rows = addRow(rows, 3);
    expect(rows).toHaveLength(2);
    expect(toJson(rows)).toBe('[{"level":5,"roleId":"r1"},{"level":null,"roleId":""}]');

    rows = updateRow(rows, rows[1]!.key, { level: '20', roleId: 'r2' });
    expect(JSON.parse(toJson(rows))).toEqual([
      { level: 5, roleId: 'r1' },
      { level: 20, roleId: 'r2' },
    ]);

    rows = removeRow(rows, rows[0]!.key);
    expect(JSON.parse(toJson(rows))).toEqual([{ level: 20, roleId: 'r2' }]);
  });

  it('stops adding at the limit', () => {
    const rows = [toRow({ level: 1, roleId: 'a' }), toRow({ level: 2, roleId: 'b' })];
    expect(addRow(rows, 2)).toBe(rows);
    expect(addRow(rows, 3)).toHaveLength(3);
  });
});
