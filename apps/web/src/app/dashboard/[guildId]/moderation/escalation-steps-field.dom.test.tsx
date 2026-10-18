// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsForm } from '@/components/settings-form';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { EscalationStepsField, type EscalationStepValue } from './escalation-steps-field';

const noop = async (state: SettingsFormState) => state;
const defaultPolicy: EscalationStepValue[] = [
  { warnThreshold: 3, action: 'TIMEOUT', durationSeconds: 3600 },
  { warnThreshold: 5, action: 'KICK' },
];

function renderField(defaultValue: EscalationStepValue[]) {
  const { container } = render(
    <SettingsForm action={noop}>
      <EscalationStepsField defaultValue={defaultValue} defaultPolicy={defaultPolicy} />
    </SettingsForm>,
  );
  return () =>
    JSON.parse(
      container.querySelector<HTMLInputElement>('input[name="escalationSteps"]')!.value,
    ) as unknown;
}

describe('EscalationStepsField rows', () => {
  it('adds a warning step above the highest threshold', () => {
    const submitted = renderField([{ warnThreshold: 4, action: 'BAN' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

    expect(submitted()).toEqual([
      { warnThreshold: 4, action: 'BAN' },
      { warnThreshold: 5, action: 'WARN' },
    ]);
  });

  it('removes a row and shows the empty message once none are left', () => {
    const submitted = renderField([
      { warnThreshold: 2, action: 'WARN' },
      { warnThreshold: 4, action: 'BAN' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    expect(submitted()).toEqual([{ warnThreshold: 4, action: 'BAN' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    expect(submitted()).toEqual([]);
    expect(screen.getByText(/No steps: warnings are recorded/)).toBeTruthy();
  });

  it('turns a step into a timeout and submits the typed length in seconds', () => {
    const submitted = renderField([{ warnThreshold: 2, action: 'WARN' }]);

    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'TIMEOUT' } });
    fireEvent.change(screen.getByLabelText('For'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '3600' } });
    fireEvent.change(screen.getByLabelText('At warning points'), { target: { value: '6' } });

    expect(submitted()).toEqual([{ warnThreshold: 6, action: 'TIMEOUT', durationSeconds: 7200 }]);
  });

  it('resets the rows to the default policy', () => {
    const submitted = renderField([{ warnThreshold: 9, action: 'BAN' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));

    expect(submitted()).toEqual(defaultPolicy);
  });
});
