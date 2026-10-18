import { ids } from '../../../tests/support/fake-discord/index.js';
import { expect, queryDatabase, test } from './support/fixtures.js';

// Both specs write the same guild_settings row.
test.describe.configure({ mode: 'serial' });

// A retry runs against the settings an earlier attempt may have saved, so each spec saves a value
// different from the one the form shows; saving the same value only answers "Nothing changed.".

test('saves the command prefix to the database', async ({ page, signIn }) => {
  await signIn('admin');
  await page.goto(`/dashboard/${ids.mainGuild}/general`);

  const field = page.getByLabel('Command prefix');
  const prefix = (await field.inputValue()) === '?' ? '$' : '?';
  await field.fill(prefix);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();

  const row = await queryDatabase<{ prefix: string }>(
    'SELECT prefix FROM guild_settings WHERE guild_id = ?',
    ids.mainGuild,
  );
  expect(row?.prefix).toBe(prefix);
  await page.reload();
  await expect(field).toHaveValue(prefix);
});

test('saves the AI channel after the bot checks it with Discord', async ({ page, signIn }) => {
  await signIn('admin');
  await page.goto(`/dashboard/${ids.mainGuild}/ai`);

  // The channel list comes from the bot's REST client (the fake Discord API).
  const field = page.getByLabel('AI channel');
  const channel =
    (await field.inputValue()) === ids.aiChannel
      ? { id: ids.generalChannel, label: '#general' }
      : { id: ids.aiChannel, label: '#ririko-ai' };
  await field.selectOption({ label: channel.label });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();

  await page.reload();
  await expect(field).toHaveValue(channel.id);
});
