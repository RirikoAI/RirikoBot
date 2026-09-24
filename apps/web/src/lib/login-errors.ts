export type LoginError = 'access_denied' | 'invalid_state' | 'missing_scope' | 'login_failed';

export const LOGIN_ERROR_MESSAGES: Record<LoginError, string> = {
  access_denied: 'Discord login was cancelled.',
  invalid_state: 'Your login link expired or was opened in another browser. Please try again.',
  missing_scope: 'Ririko needs access to your profile and server list to continue.',
  login_failed: 'Discord login failed. Please try again in a moment.',
};

export function loginErrorMessage(code: string | string[] | undefined): string | null {
  return typeof code === 'string' && code in LOGIN_ERROR_MESSAGES
    ? LOGIN_ERROR_MESSAGES[code as LoginError]
    : null;
}
