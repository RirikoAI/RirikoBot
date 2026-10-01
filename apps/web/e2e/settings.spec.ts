import { ids } from '../../../tests/support/fake-discord/index.js';
import { expect, queryDatabase, test } from './support/fixtures.js';

// Both specs write the same guild_settings row.
test.describe.configure({ mode: 'serial' });

test('saves the command prefix to the database', async ({ page, signIn }) => {
  await signIn('admin');
  await page.goto(`/dashboard/${ids.mainGuild}/general`);

  await page.getByLabel('Command prefix').fill('?');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();

  const row = await queryDatabase<{ prefix: string }>(
    'SELECT prefix FROM guild_settings WHERE guild_id = ?',
    ids.mainGuild,
  );
  expect(row?.prefix).toBe('?');
  await page.reload();
  await expect(page.getByLabel('Command prefix')).toHaveValue('?');
});

test('saves the AI channel after the bot checks it with Discord', async ({ page, signIn }) => {
  await signIn('admin');
  await page.goto(`/dashboard/${ids.mainGuild}/ai`);

  // The channel list comes from the bot's REST client (the fake Discord API).
  await page.getByLabel('AI channel').selectOption({ label: '#ririko-ai' });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('AI channel')).toHaveValue(ids.aiChannel);
});
