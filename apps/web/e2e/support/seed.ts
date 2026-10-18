/**
 * Creates the E2E database from scratch and seeds what the specs read: a Waifu TCG collection
 * for the fake `admin` user. Guild settings start empty (defaults), as on a new server.
 *
 * Card ids are fixed so the album's render cache (`public/cards/<id>.png`) is reused across runs
 * instead of growing. The cards have no art asset, so rendering never needs the network.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDatabaseClient, WaifuCardRepository } from '@ririko/database';
import { ids } from '../../../../tests/support/fake-discord/index.js';
import { DATABASE_FILE, LISTED_CARD_NAME, RARE_CARDS, SEEDED_CARDS } from './env.js';

for (const suffix of ['', '-wal', '-shm']) rmSync(`${DATABASE_FILE}${suffix}`, { force: true });
mkdirSync(dirname(DATABASE_FILE), { recursive: true });

const db = await createDatabaseClient({ dialect: 'sqlite', url: DATABASE_FILE, autoMigrate: true });
const cards = new WaifuCardRepository(db);

for (let n = 1; n <= SEEDED_CARDS; n++) {
  const number = String(n).padStart(2, '0');
  const card = await cards.create({
    id: `e2e-card-${number}`,
    assetId: 'e2e-no-art',
    name: `E2E Card ${number}`,
    rarity: n <= RARE_CARDS ? 'RARE' : 'COMMON',
    element: 'WATER',
    attack: 100,
    defense: 100,
    speed: 100,
    health: 1000,
    collectionNumber: n,
  });
  await cards.createUserCard({
    userId: ids.admin,
    cardId: card.id,
    serialNumber: 1,
    state: card.name === LISTED_CARD_NAME ? 'IN_MARKET' : 'IDLE',
    // Card 01 is the oldest, so it is last in the newest-first album.
    obtainedAt: new Date(Date.UTC(2026, 0, 1) + n * 60_000),
  });
}

await db.close();
console.log(`Seeded ${SEEDED_CARDS} cards into ${DATABASE_FILE}`);
