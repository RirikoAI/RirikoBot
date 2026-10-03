import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { hiddenJson, render, textOf } from '../../../../../../../tests/support/markup';

const form = vi.hoisted(() => ({ state: { status: 'idle' } as SettingsFormState }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: () => [form.state, () => undefined, false],
}));

const { SettingsForm } = await import('@/components/settings-form');
const { GameRulesField } = await import('./game-rules-field');

const noop = async (state: SettingsFormState) => state;
const games = [
  { command: 'coinflip', description: 'Flip a coin.', cooldownSeconds: 5, hasOtherRules: false },
  { command: 'dice', description: 'Roll dice.', cooldownSeconds: 10, hasOtherRules: true },
];

function field(defaultValue: Parameters<typeof GameRulesField>[0]['defaultValue']) {
  return render(
    <SettingsForm action={noop}>
      <GameRulesField games={games} defaultValue={defaultValue} />
    </SettingsForm>,
  );
}

describe('GameRulesField', () => {
  beforeEach(() => {
    form.state = { status: 'idle' };
  });

  it('lists every game in order and submits one rule per game, defaulting to on with its own cooldown', () => {
    const html = field([{ command: 'dice', enabled: false, cooldownSeconds: 30 }]);
    expect(hiddenJson(html, 'rules')).toEqual([
      { command: 'coinflip', enabled: true, cooldownSeconds: null },
      { command: 'dice', enabled: false, cooldownSeconds: 30 },
    ]);
    const text = textOf(html);
    expect(text).toContain('Row 1 coinflip Flip a coin.');
    expect(text).toContain('Row 2 dice Roll dice.');
    expect(html).toContain('placeholder="Own: 5s"');
    expect(html).toContain('placeholder="Own: 10s"');
  });

  it('points to the Commands page only for games that have role or channel rules there', () => {
    const html = field([]);
    expect(html.match(/Also has role or channel rules on the Commands page/g)).toHaveLength(1);
    expect(html.split('Row 2')[1]).toContain('Also has role or channel rules');
  });

  it('shows the returned values and errors, sending a non-numeric cooldown as typed so the schema reports it', () => {
    form.state = {
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { rules: ['Row 1: Enter a whole number of seconds.'] },
      values: {
        rules: JSON.stringify([{ command: 'coinflip', enabled: true, cooldownSeconds: 'soon' }]),
      },
    };
    const html = field([]);
    expect(hiddenJson(html, 'rules')).toEqual([
      { command: 'coinflip', enabled: true, cooldownSeconds: 'soon' },
      { command: 'dice', enabled: true, cooldownSeconds: null },
    ]);
    expect(textOf(html)).toContain('Row 1: Enter a whole number of seconds.');
  });

  it('falls back to the saved rules when the returned value is not JSON', () => {
    form.state = { status: 'error', message: 'x', values: { rules: 'nope' } };
    const html = field([{ command: 'coinflip', enabled: false, cooldownSeconds: 0 }]);
    expect(hiddenJson(html, 'rules')).toEqual([
      { command: 'coinflip', enabled: false, cooldownSeconds: 0 },
      { command: 'dice', enabled: true, cooldownSeconds: null },
    ]);
  });
});
