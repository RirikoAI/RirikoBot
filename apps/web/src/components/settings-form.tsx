'use client';

import { createContext, useActionState, useContext, useId, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { INITIAL_SETTINGS_FORM_STATE, type SettingsFormState } from '@/lib/settings-form-state';

type SettingsAction = (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;

const FormStateContext = createContext<SettingsFormState>(INITIAL_SETTINGS_FORM_STATE);

const INPUT_CLASS =
  'w-full rounded-md border border-edge bg-ink px-3 py-2 text-sm text-zinc-100 focus-visible:outline-2 focus-visible:outline-sakura aria-invalid:border-red-500';

/** A settings form bound to a Server Action; fields read errors and values from its state. */
export function SettingsForm({
  action,
  children,
}: {
  action: SettingsAction;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, INITIAL_SETTINGS_FORM_STATE);

  return (
    <form action={formAction} noValidate className="flex max-w-xl flex-col gap-6">
      <FormStateContext value={state}>{children}</FormStateContext>
      <div className="flex items-center gap-4">
        <SubmitButton />
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
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-sakura-strong px-4 py-2 text-sm font-semibold text-white hover:bg-sakura disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

interface FieldProps {
  name: string;
  label: string;
  description?: string;
  defaultValue: string;
}

/**
 * Label, description and errors around one control. React resets forms after an action, so
 * the value shown afterwards is what the action returned (saved or submitted), else the default.
 */
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
  const state = useContext(FormStateContext);
  const id = useId();
  const errors = state.status === 'error' ? state.fieldErrors?.[name] : undefined;
  const returned = state.status === 'idle' ? undefined : state.values?.[name];
  const value = returned === undefined ? defaultValue : String(returned);
  const describedBy =
    [description ? `${id}-description` : null, errors ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined;

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
      {description ? (
        <p id={`${id}-description`} className="text-xs text-zinc-400">
          {description}
        </p>
      ) : null}
      {errors ? (
        <p id={`${id}-error`} className="text-xs text-red-300">
          {errors.join(' ')}
        </p>
      ) : null}
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
          {...props}
          key={props.defaultValue}
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

export interface SelectOption {
  value: string;
  label: string;
  group?: string | null;
}

/** Native select; options sharing a `group` are shown under one heading. */
export function SelectField({
  options,
  emptyLabel,
  ...field
}: FieldProps & { options: SelectOption[]; emptyLabel?: string }) {
  const groups = new Map<string, SelectOption[]>();
  for (const option of options) {
    const group = option.group ?? '';
    groups.set(group, [...(groups.get(group) ?? []), option]);
  }
  return (
    <Field
      {...field}
      control={(props) => (
        <select {...props} key={props.defaultValue} className={INPUT_CLASS}>
          {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
          {[...groups].map(([group, items]) =>
            group ? (
              <optgroup key={group} label={group}>
                {items.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              items.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))
            ),
          )}
        </select>
      )}
    />
  );
}
