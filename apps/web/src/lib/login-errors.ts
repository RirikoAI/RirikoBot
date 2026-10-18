export type LoginError =
  | 'access_denied'
  | 'invalid_state'
  | 'missing_scope'
  | 'login_failed'
  | 'invite_cancelled'
  | 'invite_invalid_state'
  | 'invite_no_server'
  | 'invite_failed';

export const LOGIN_ERROR_MESSAGES: Record<LoginError, string> = {
  access_denied: 'Discord login was cancelled.',
  invalid_state: 'Your login link expired or was opened in another browser. Please try again.',
  missing_scope: 'Ririko needs access to your profile and server list to continue.',
  login_failed: 'Discord login failed. Please try again in a moment.',
  invite_cancelled: 'The invite was cancelled. Ririko was not added to a server.',
  invite_invalid_state:
    'Your invite link expired or was opened in another browser. Please start the invite again.',
  invite_no_server: 'Discord did not say which server to add Ririko to. Please invite again.',
  invite_failed: 'Inviting Ririko failed. Please try again in a moment.',
};

export function loginErrorMessage(code: string | string[] | undefined): string | null {
  return typeof code === 'string' && code in LOGIN_ERROR_MESSAGES
    ? LOGIN_ERROR_MESSAGES[code as LoginError]
    : null;
}
