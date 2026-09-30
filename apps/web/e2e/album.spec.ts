import { expect, test } from './support/fixtures.js';
import { LISTED_CARD_NAME, RARE_CARDS, SEEDED_CARDS } from './support/env.js';

test('pages through the collection newest first', async ({ page, signIn }) => {
  await signIn('admin');
  await page.goto('/account/album');

  await expect(page.getByText(`${SEEDED_CARDS} cards.`)).toBeVisible();
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(page.getByText(`E2E Card ${SEEDED_CARDS}`)).toBeVisible();

  await page.getByRole('link', { name: 'Older →' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  const listed = page.getByRole('listitem').filter({ hasText: LISTED_CARD_NAME });
  await expect(listed).toContainText('Listed on the market');
});

test('filters the collection by rarity', async ({ page, signIn }) => {
  await signIn('admin');
  await page.goto('/account/album');

  await page.getByLabel('Rarity').selectOption('RARE');
  await page.getByRole('button', { name: 'Filter' }).click();

  await expect(page).toHaveURL(/rarity=RARE/);
  await expect(page.getByText(`${RARE_CARDS} cards match these filters.`)).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'E2E Card' })).toHaveCount(RARE_CARDS);
});
