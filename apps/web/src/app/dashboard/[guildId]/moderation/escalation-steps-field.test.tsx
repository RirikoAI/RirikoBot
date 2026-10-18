import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { hiddenJson, render, textOf } from '../../../../../../../tests/support/markup';

const form = vi.hoisted(() => ({ state: { status: 'idle' } as SettingsFormState }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: () => [form.state, () => undefined, false],
}));

const { SettingsForm } = await import('@/components/settings-form');
const { EscalationStepsField } = await import('./escalation-steps-field');

const noop = async (state: SettingsFormState) => state;
const defaultPolicy = [
  { warnThreshold: 3, action: 'TIMEOUT' as const, durationSeconds: 3600 },
  { warnThreshold: 5, action: 'KICK' as const },
];

function field(defaultValue: Parameters<typeof EscalationStepsField>[0]['defaultValue']) {
  return render(
    <SettingsForm action={noop}>
      <EscalationStepsField defaultValue={defaultValue} defaultPolicy={defaultPolicy} />
    </SettingsForm>,
  );
}

describe('EscalationStepsField', () => {
  beforeEach(() => {
    form.state = { status: 'idle' };
  });

  it('submits the saved steps as JSON, with timeouts in seconds and other actions without a length', () => {
    const html = field([
      { warnThreshold: 3, action: 'TIMEOUT', durationSeconds: 7200 },
      { warnThreshold: 5, action: 'BAN' },
    ]);
    expect(hiddenJson(html, 'escalationSteps')).toEqual([
      { warnThreshold: 3, action: 'TIMEOUT', durationSeconds: 7200 },
      { warnThreshold: 5, action: 'BAN' },
    ]);
    expect(textOf(html)).toContain('Row 1');
    expect(textOf(html)).toContain('Row 2');
    // Only the timeout row has a length box, shown in the largest unit that divides it.
    expect(html.match(/For<input/g)).toHaveLength(1);
    expect(html).toMatch(/value="2"/);
    expect(html).toMatch(/<option value="3600" selected="">hours<\/option>/);
  });

  it('explains an empty policy', () => {
    const html = field([]);
    expect(textOf(html)).toContain(
      'No steps: warnings are recorded but never lead to a timeout, kick or ban.',
    );
    expect(hiddenJson(html, 'escalationSteps')).toEqual([]);
  });

  it('shows what the last save returned, errors included, instead of the saved steps', () => {
    form.state = {
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { escalationSteps: ['Row 1: Enter a whole number from 1 to 100.'] },
      values: {
        escalationSteps: JSON.stringify([
          { warnThreshold: null, action: 'TIMEOUT', durationSeconds: null },
        ]),
      },
    };
    const html = field([{ warnThreshold: 3, action: 'KICK' }]);
    // A blank box stays blank so its error points at an empty box.
    expect(hiddenJson(html, 'escalationSteps')).toEqual([
      { warnThreshold: null, action: 'TIMEOUT', durationSeconds: null },
    ]);
    expect(textOf(html)).toContain('Row 1: Enter a whole number from 1 to 100.');
    expect(html).toMatch(/aria-invalid="true"/);
  });

  it('falls back to the saved steps when the returned value is not JSON', () => {
    form.state = { status: 'error', message: 'x', values: { escalationSteps: 'not json' } };
    const html = field([{ warnThreshold: 4, action: 'WARN' }]);
    expect(hiddenJson(html, 'escalationSteps')).toEqual([{ warnThreshold: 4, action: 'WARN' }]);
  });

  it('offers a default length of ten minutes for a step switched to a timeout later', () => {
    const html = field([{ warnThreshold: 2, action: 'TIMEOUT' }]);
    expect(hiddenJson(html, 'escalationSteps')).toEqual([
      { warnThreshold: 2, action: 'TIMEOUT', durationSeconds: 600 },
    ]);
  });
});
