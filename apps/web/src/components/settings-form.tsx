'use client';

import Link from 'next/link';
import {
  createContext,
  Fragment,
  startTransition,
  useActionState,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import { INITIAL_SETTINGS_FORM_STATE, type SettingsFormState } from '@/lib/settings-form-state';

type SettingsAction = (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;

const FormStateContext = createContext<SettingsFormState>(INITIAL_SETTINGS_FORM_STATE);

export const INPUT_CLASS =
  'w-full rounded-md border border-edge bg-ink px-3 py-2 text-sm text-zinc-100 focus-visible:outline-2 focus-visible:outline-sakura aria-invalid:border-red-500';

const SECONDARY_BUTTON_CLASS =
  'rounded-md border border-edge px-3 py-1.5 text-sm text-zinc-200 hover:border-sakura disabled:opacity-60';

/**
 * A settings form bound to a Server Action; fields read errors and values from its state.
 * When the action answers that a passkey check is needed (sensitive modules), the form offers
 * one and then submits the same values again.
 */
export function SettingsForm({
  action,
  children,
  submitLabel = 'Save changes',
}: {
  action: SettingsAction;
  children: ReactNode;
  /** Text of the submit button, such as "Publish panel". */
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_SETTINGS_FORM_STATE);
  const lastSubmission = useRef<FormData | null>(null);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  function submit(formData: FormData) {
    lastSubmission.current = formData;
    setPasskeyError(null);
    formAction(formData);
  }

  async function confirmWithPasskey() {
    setChecking(true);
    setPasskeyError(null);
    // Loaded on demand: only forms for sensitive settings ever need the WebAuthn client.
    const { runPasskeyCheck } = await import('@/components/passkeys/run-passkey-check');
    const error = await runPasskeyCheck();
    setChecking(false);
    const formData = lastSubmission.current;
    if (error) setPasskeyError(error);
    else if (formData) startTransition(() => formAction(formData));
  }

  const reason = state.status === 'error' ? state.reason : undefined;

  return (
    <form action={submit} noValidate className="flex max-w-2xl flex-col gap-6">
      <FormStateContext value={state}>{children}</FormStateContext>
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton label={submitLabel} />
        {state.status !== 'idle' ? (
          <p
            role={state.status === 'error' ? 'alert' : 'status'}
            className={
              state.status === 'error' ? 'text-sm text-red-300' : 'text-sm text-emerald-300'
            }
          >
            {state.message}
          </p>
        ) : null}
        {reason === 'passkey-check-required' ? (
          <button
            type="button"
            onClick={confirmWithPasskey}
            disabled={checking || pending}
            className={SECONDARY_BUTTON_CLASS}
          >
            {checking ? 'Waiting for your passkey…' : 'Confirm with passkey and save'}
          </button>
        ) : null}
        {reason === 'passkey-required' ? (
          <Link href="/account/security" className="text-sm text-sakura underline">
            Add a passkey
          </Link>
        ) : null}
        {passkeyError ? (
          <p role="alert" className="text-sm text-red-300">
            {passkeyError}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-sakura-strong px-4 py-2 text-sm font-semibold text-white hover:bg-sakura disabled:opacity-60"
    >
      {pending ? 'Saving…' : label}
    </button>
  );
}

/**
 * State of one settings field. React resets forms after an action, so a field shows the value
 * the action returned (saved or submitted) when there is one; `returned` is that raw value.
 */
export function useSettingsField(name: string, description: string | undefined) {
  const state = useContext(FormStateContext);
  const id = useId();
  const errors = state.status === 'error' ? state.fieldErrors?.[name] : undefined;
  const returned = state.status === 'idle' ? undefined : state.values?.[name];
  const describedBy =
    [description ? `${id}-description` : null, errors ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined;
  return { id, errors, returned, describedBy };
}

/** Description and error lines under a control, matching `useSettingsField` ids. */
export function FieldNotes({
  id,
  description,
  errors,
}: {
  id: string;
  description?: string | undefined;
  errors: string[] | undefined;
}) {
  return (
    <>
      {description ? (
        <p id={`${id}-description`} className="text-xs text-zinc-400">
          {description}
        </p>
      ) : null}
      {errors ? (
        <div id={`${id}-error`} className="flex flex-col gap-0.5 text-xs text-red-300">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}
    </>
  );
}

interface FieldProps {
  name: string;
  label: string;
  description?: string;
  defaultValue: string;
}

/** Label, description and errors around one text-valued control. */
function Field({
  name,
  label,
  description,
  defaultValue,
  control,
}: FieldProps & {
  control: (props: {
    id: string;
    name: string;
    defaultValue: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}) {
  const { id, errors, returned, describedBy } = useSettingsField(name, description);
  const value = returned === undefined || returned === null ? defaultValue : String(returned);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-zinc-200">
        {label}
      </label>
      {control({
        id,
        name,
        defaultValue: value,
        'aria-invalid': Boolean(errors),
        'aria-describedby': describedBy,
      })}
      <FieldNotes id={id} description={description} errors={errors} />
    </div>
  );
}

export function TextField({
  maxLength,
  list,
  ...field
}: FieldProps & { maxLength?: number; list?: string }) {
  return (
    <Field
      {...field}
      control={(props) => (
        <input
          key={props.defaultValue}
          {...props}
          type="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={maxLength}
          list={list}
          className={INPUT_CLASS}
        />
      )}
    />
  );
}

/** Whole-number input; the shared schema enforces the range, `min`/`max` guide the browser. */
export function NumberField({
  min,
  max,
  defaultValue,
  ...field
}: Omit<FieldProps, 'defaultValue'> & { min: number; max: number; defaultValue: number }) {
  return (
    <Field
      {...field}
      defaultValue={String(defaultValue)}
      control={(props) => (
        <input
          key={props.defaultValue}
          {...props}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          className={`${INPUT_CLASS} max-w-32`}
        />
      )}
    />
  );
}

/** On/off checkbox; an unchecked box submits nothing, which `readFormFields` reads as false. */
export function ToggleField({
  name,
  label,
  description,
  defaultValue,
}: Omit<FieldProps, 'defaultValue'> & { defaultValue: boolean }) {
  const { id, errors, returned, describedBy } = useSettingsField(name, description);
  const checked = typeof returned === 'boolean' ? returned : defaultValue;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-zinc-200">
        <input
          id={id}
          key={String(checked)}
          name={name}
          type="checkbox"
          defaultChecked={checked}
          aria-invalid={Boolean(errors)}
          aria-describedby={describedBy}
          className="h-4 w-4 accent-sakura"
        />
        {label}
      </label>
      <FieldNotes id={id} description={description} errors={errors} />
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  group?: string | null;
}

/** `<option>`s, with options sharing a `group` under one `<optgroup>`. */
export function OptionList({ options }: { options: SelectOption[] }) {
  const groups = new Map<string, SelectOption[]>();
  for (const option of options) {
    const group = option.group ?? '';
    groups.set(group, [...(groups.get(group) ?? []), option]);
  }
  return [...groups].map(([group, items]) => {
    const list = items.map((item) => (
      <option key={item.value} value={item.value}>
        {item.label}
      </option>
    ));
    return group ? (
      <optgroup key={group} label={group}>
        {list}
      </optgroup>
    ) : (
      <Fragment key="">{list}</Fragment>
    );
  });
}

/** Native select; options sharing a `group` are shown under one heading. */
export function SelectField({
  options,
  emptyLabel,
  ...field
}: FieldProps & { options: SelectOption[]; emptyLabel?: string }) {
  return (
    <Field
      {...field}
      control={(props) => (
        <select key={props.defaultValue} {...props} className={INPUT_CLASS}>
          {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
          <OptionList options={options} />
        </select>
      )}
    />
  );
}

/**
 * A list of choices (roles, channels) shown as removable chips, with a select to add more.
 * Each chosen value is submitted as its own hidden input, so the action reads the list with
 * `formData.getAll(name)`.
 */
export function ListField({
  name,
  label,
  description,
  defaultValue,
  options,
  addLabel,
}: Omit<FieldProps, 'defaultValue'> & {
  defaultValue: string[];
  options: SelectOption[];
  /** Placeholder of the add select, such as "Add a role…". */
  addLabel: string;
}) {
  const field = useSettingsField(name, description);
  const initial = Array.isArray(field.returned)
    ? field.returned.filter((value): value is string => typeof value === 'string')
    : defaultValue;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={field.id} className="text-sm font-medium text-zinc-200">
        {label}
      </label>
      <ListControl
        key={initial.join(',')}
        name={name}
        initial={initial}
        options={options}
        addLabel={addLabel}
        label={label}
        field={field}
      />
      <FieldNotes id={field.id} description={description} errors={field.errors} />
    </div>
  );
}

function ListControl({
  name,
  initial,
  options,
  addLabel,
  label,
  field,
}: {
  name: string;
  initial: string[];
  options: SelectOption[];
  addLabel: string;
  label: string;
  field: ReturnType<typeof useSettingsField>;
}) {
  const [chosen, setChosen] = useState(initial);
  const labels = new Map(options.map((option) => [option.value, option.label]));
  const available = options.filter((option) => !chosen.includes(option.value));

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label={label} className="flex flex-wrap gap-2">
        {chosen.length === 0 ? <li className="text-xs text-zinc-500">None</li> : null}
        {chosen.map((value) => {
          const text = labels.get(value) ?? `Unknown (${value})`;
          return (
            <li
              key={value}
              className="flex items-center gap-1 rounded-full border border-edge bg-ink py-0.5 pr-1 pl-3 text-xs text-zinc-200"
            >
              {text}
              <input type="hidden" name={name} value={value} />
              <button
                type="button"
                aria-label={`Remove ${text}`}
                onClick={() => setChosen(chosen.filter((item) => item !== value))}
                className="rounded-full px-1.5 text-zinc-400 hover:text-white"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <select
        id={field.id}
        value=""
        onChange={(event) => {
          const value = event.target.value;
          if (value) setChosen([...chosen, value]);
        }}
        disabled={available.length === 0}
        aria-invalid={Boolean(field.errors)}
        aria-describedby={field.describedBy}
        className={`${INPUT_CLASS} max-w-sm`}
      >
        <option value="">{available.length === 0 ? 'Nothing left to add' : addLabel}</option>
        <OptionList options={available} />
      </select>
    </div>
  );
}
