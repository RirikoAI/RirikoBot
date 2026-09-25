/** Result of a settings Server Action, rendered by the client settings form. */
export type SettingsFormState =
  | { status: 'idle' }
  | { status: 'saved'; message: string; values: Record<string, unknown> }
  | {
      status: 'error';
      message: string;
      fieldErrors?: Record<string, string[]> | undefined;
      /** What the user submitted, so fields keep their input after the form resets. */
      values?: Record<string, unknown> | undefined;
    };

export const INITIAL_SETTINGS_FORM_STATE: SettingsFormState = { status: 'idle' };
