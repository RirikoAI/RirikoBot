import { ids } from '../../../tests/support/fake-discord/index.js';
import { discordRequests, expect, test } from './support/fixtures.js';

test('signs in through Discord OAuth2 and signs out', async ({ page, context, signIn }) => {
  await signIn('admin');
  await expect(page.getByRole('heading', { name: 'Choose a server' })).toBeVisible();
  expect((await context.cookies()).map((c) => c.name)).toContain('__Host-ririko_session');

  // A browser the user has not signed in from before is reported to them by DM.
  await expect
    .poll(async () =>
      (await discordRequests()).some(
        (r) =>
          r.method === 'POST' &&
          r.path === '/users/@me/channels' &&
          (r.body as { recipient_id?: string }).recipient_id === ids.admin,
      ),
    )
    .toBe(true);

  await page.goto('/');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in with Discord' })).toBeVisible();
  expect((await context.cookies()).map((c) => c.name)).not.toContain('__Host-ririko_session');
});

test('rejects an OAuth2 callback that this browser did not start', async ({ page }) => {
  await page.goto('/api/auth/callback?code=forged&state=forged');

  await expect(page).toHaveURL(/\/\?error=invalid_state$/);
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Your login link expired or was opened in another browser.' }),
  ).toBeVisible();
});
