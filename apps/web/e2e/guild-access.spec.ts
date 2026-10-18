import { ids } from '../../../tests/support/fake-discord/index.js';
import { expect, test } from './support/fixtures.js';

test('lists only the servers the user can manage', async ({ page, signIn }) => {
  await signIn('admin');

  await expect(page.getByText('Ririko Test Server')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Manage' })).toHaveAttribute(
    'href',
    `/dashboard/${ids.mainGuild}`,
  );
  // `admin` is a member of Other Server without Manage Server.
  await expect(page.getByText('Other Server')).toHaveCount(0);
});

test('answers 404 for a server the user cannot manage', async ({ page, signIn }) => {
  await signIn('admin');

  const response = await page.goto(`/dashboard/${ids.otherGuild}`);
  expect(response?.status()).toBe(404);
});

test('shows no servers to a member without Manage Server', async ({ page, signIn }) => {
  await signIn('member');

  await expect(page.getByText("You don't manage any Discord servers yet.")).toBeVisible();
});
