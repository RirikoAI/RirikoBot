import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsFormState } from '@/lib/settings-form-state';
import {
  elements,
  fieldsNamed,
  hiddenValues,
  render,
  textOf,
} from '../../../../tests/support/markup';

const form = vi.hoisted(() => ({ state: { status: 'idle' } as SettingsFormState }));

// Server rendering never runs an action, so tests choose the state a form was last given.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: () => [form.state, () => undefined, false],
}));

const {
  ActionButtonForm,
  DateField,
  FieldNotes,
  ListField,
  NumberField,
  OptionList,
  SelectField,
  SettingsForm,
  TextAreaField,
  TextField,
  ToggleField,
} = await import('./settings-form');

const noop = async (state: SettingsFormState) => state;

function inForm(children: React.ReactNode) {
  return render(<SettingsForm action={noop}>{children}</SettingsForm>);
}

describe('settings form fields', () => {
  beforeEach(() => {
    form.state = { status: 'idle' };
  });

  it('shows the default value, label and description of a text field', () => {
    const html = inForm(
      <TextField
        name="prefix"
        label="Prefix"
        description="Used before commands."
        defaultValue="!"
        maxLength={5}
      />,
    );
    expect(html).toMatch(/<label[^>]*>Prefix<\/label>/);
    expect(fieldsNamed(html, 'prefix')).toEqual([
      expect.objectContaining({ type: 'text', value: '!', 'aria-invalid': 'false' }),
    ]);
    expect(fieldsNamed(html, 'prefix')[0]).toMatchObject({ maxLength: '5' });
    expect(textOf(html)).toContain('Used before commands.');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Save changes<\/button>/);
  });

  it('shows what the last save returned instead of the default, with its field errors', () => {
    form.state = {
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { prefix: ['Use at most 5 characters.'] },
      values: { prefix: 'toolong' },
    };
    const html = inForm(<TextField name="prefix" label="Prefix" defaultValue="!" />);
    expect(fieldsNamed(html, 'prefix')[0]).toMatchObject({
      value: 'toolong',
      'aria-invalid': 'true',
    });
    expect(textOf(html)).toContain('Use at most 5 characters.');
    expect(html).toMatch(/role="alert"[^>]*>Please fix the highlighted fields\.</);
  });

  it('shows a saved message as a status and keeps saved values', () => {
    form.state = { status: 'saved', message: 'Settings saved.', values: { prefix: '?' } };
    const html = inForm(<TextField name="prefix" label="Prefix" defaultValue="!" />);
    expect(fieldsNamed(html, 'prefix')[0]).toMatchObject({ value: '?' });
    expect(html).toMatch(/role="status"[^>]*>Settings saved\.</);
  });

  it('offers the passkey check button, or the way to add a passkey', () => {
    form.state = {
      status: 'error',
      message: 'Confirm it is you with your passkey first.',
      reason: 'passkey-check-required',
    };
    expect(inForm(<TextField name="a" label="A" defaultValue="" />)).toContain(
      'Confirm with passkey and save',
    );

    form.state = {
      status: 'error',
      message: 'Add a passkey to your account first.',
      reason: 'passkey-required',
    };
    const html = inForm(<TextField name="a" label="A" defaultValue="" />);
    expect(html).toMatch(/<a[^>]*href="\/account\/security"[^>]*>Add a passkey<\/a>/);
    expect(html).not.toContain('Confirm with passkey and save');
  });

  it('renders text areas, numbers (empty for null) and dates', () => {
    const html = inForm(
      <>
        <TextAreaField name="note" label="Note" defaultValue="Hello" rows={3} />
        <NumberField name="limit" label="Limit" defaultValue={7} min={1} max={9} />
        <NumberField name="ratio" label="Ratio" defaultValue={null} min={0} max={1} step="any" />
        <DateField name="day" label="Day" defaultValue="2026-10-03" />
      </>,
    );
    expect(html).toContain('>Hello</textarea>');
    expect(fieldsNamed(html, 'note')[0]).toMatchObject({ rows: '3' });
    expect(fieldsNamed(html, 'limit')[0]).toMatchObject({
      type: 'number',
      min: '1',
      max: '9',
      step: '1',
      value: '7',
      inputMode: 'numeric',
    });
    expect(fieldsNamed(html, 'ratio')[0]).toMatchObject({
      step: 'any',
      value: '',
      inputMode: 'decimal',
    });
    expect(fieldsNamed(html, 'day')[0]).toMatchObject({ type: 'date', value: '2026-10-03' });
  });

  it('renders a toggle checked by default and unchecked once a save returned false', () => {
    const toggle = <ToggleField name="enabled" label="Enabled" defaultValue />;
    expect(fieldsNamed(inForm(toggle), 'enabled')[0]).toMatchObject({
      type: 'checkbox',
      checked: '',
    });
    form.state = { status: 'saved', message: 'Settings saved.', values: { enabled: false } };
    expect(fieldsNamed(inForm(toggle), 'enabled')[0]).not.toHaveProperty('checked');
  });

  it('renders select options under their group headings and an optional empty choice', () => {
    const html = inForm(
      <SelectField
        name="channel"
        label="Channel"
        defaultValue="b"
        emptyLabel="None"
        options={[
          { value: 'a', label: 'general', group: 'Text' },
          { value: 'b', label: 'rules', group: 'Text' },
          { value: 'c', label: 'Lounge' },
        ]}
      />,
    );
    expect(html).toContain('<option value="">None</option>');
    expect(html).toMatch(
      /<optgroup label="Text"><option value="a">general<\/option><option value="b" selected="">rules<\/option><\/optgroup>/,
    );
    expect(html).toContain('<option value="c">Lounge</option>');
  });

  it('lists chosen values as removable chips, each submitted as its own hidden input', () => {
    const html = inForm(
      <ListField
        name="roleIds"
        label="Roles"
        defaultValue={['r1', 'gone']}
        options={[
          { value: 'r1', label: 'Mods' },
          { value: 'r2', label: 'Helpers' },
        ]}
        addLabel="Add a role…"
      />,
    );
    expect(hiddenValues(html, 'roleIds')).toEqual(['r1', 'gone']);
    expect(textOf(html)).toContain('Mods');
    expect(textOf(html)).toContain('Unknown (gone)');
    expect(html).toContain('aria-label="Remove Mods"');
    // Only roles not chosen yet can be added.
    expect(html).toContain('>Add a role…</option>');
    expect(html).toContain('<option value="r2">Helpers</option>');
    expect(html).not.toContain('<option value="r1">');
  });

  it('says so when a list is empty or nothing is left to add', () => {
    const empty = inForm(
      <ListField
        name="x"
        label="X"
        defaultValue={[]}
        options={[{ value: 'a', label: 'A' }]}
        addLabel="Add…"
      />,
    );
    expect(textOf(empty)).toContain('None');
    const full = inForm(
      <ListField
        name="x"
        label="X"
        defaultValue={['a']}
        options={[{ value: 'a', label: 'A' }]}
        addLabel="Add…"
      />,
    );
    expect(full).toContain('Nothing left to add');
    expect(elements(full, 'select')[0]).toHaveProperty('disabled');
  });

  it('keeps a list as returned by the last save', () => {
    form.state = { status: 'saved', message: 'ok', values: { x: ['b'] } };
    const html = inForm(
      <ListField
        name="x"
        label="X"
        defaultValue={['a']}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        addLabel="Add…"
      />,
    );
    expect(hiddenValues(html, 'x')).toEqual(['b']);
  });

  it('renders description and error lines only when there are some', () => {
    expect(render(<FieldNotes id="f" errors={undefined} />)).toBe('');
    const html = render(<FieldNotes id="f" description="Help" errors={['One', 'Two']} />);
    expect(html).toContain('id="f-description"');
    expect(html).toContain('id="f-error"');
    expect(textOf(html)).toBe('Help One Two');
  });

  it('groups plain options without a group heading', () => {
    expect(
      render(
        <select>
          <OptionList options={[{ value: '1', label: 'One' }]} />
        </select>,
      ),
    ).toBe('<select><option value="1">One</option></select>');
  });

  it('renders an action button form with hidden fields and its message', () => {
    form.state = { status: 'saved', message: 'Role removed.', values: {} };
    const html = render(
      <ActionButtonForm
        action={noop}
        fields={{ bindingId: 'b1', messageId: 'm1' }}
        label="Remove"
        confirmMessage="Sure?"
      >
        <span>extra</span>
      </ActionButtonForm>,
    );
    expect(hiddenValues(html, 'bindingId')).toEqual(['b1']);
    expect(hiddenValues(html, 'messageId')).toEqual(['m1']);
    expect(textOf(html)).toContain('extra');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Remove<\/button>/);
    expect(html).toMatch(/role="status"[^>]*>Role removed\.</);
  });
});
