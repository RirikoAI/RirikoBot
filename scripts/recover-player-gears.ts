import { createDatabaseClient } from '../packages/database/src/index.js';

/**
 * Recovers orphaned user inventory items by re-linking old pre-push item_id UUIDs
 * to the current game_items UUIDs.
 *
 * Supports `--dry-run` to preview changes without modifying the database.
 */
async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`Starting gear recovery${isDryRun ? ' (DRY RUN)' : ''}...`);

  const currentDb = await createDatabaseClient({ dialect: 'sqlite', url: './data/ririko.sqlite' });
  const backupDb = await createDatabaseClient({
    dialect: 'sqlite',
    url: './data/ririko.backup-2026-09-19-pre-import.sqlite',
  });
  const raw = currentDb.raw;
  const bRaw = backupDb.raw;

  // 1. Current canonical items in database (code -> current active UUID)
  const currentItems = raw.prepare('SELECT id, code, name FROM game_items').all() as {
    id: string;
    code: string;
    name: string;
  }[];
  const codeToCurrentId = new Map(currentItems.map((i) => [i.code, i.id]));

  // 2. Backup canonical items (old UUID -> code)
  const backupItems = bRaw.prepare('SELECT id, code, name FROM game_items').all() as {
    id: string;
    code: string;
    name: string;
  }[];
  const backupIdToCode = new Map(backupItems.map((i) => [i.id, i.code]));

  // 3. Full mapping dictionary: old UUID -> canonical catalog code
  const oldUuidToCode: Record<string, string> = {
    // 16 IDs from the 2026-09-19 pre-import backup
    ...Object.fromEntries(backupIdToCode.entries()),

    // Crafting Dust (quantities up to 3501, or already updated post-push)
    'f3e71427-7629-4edd-8a25-e3dc375a9224': 'CRAFTING_DUST',
    '96d8523d-19ac-46b3-a5cd-dff576c0d057': 'CRAFTING_DUST',

    // Exact matches from economy_transactions (Crafting recipes)
    'df949301-cdc7-46b7-ae01-1a4e1490fc21': 'ARMOR_MAGMA_MAIL',
    '6dff2dec-ff02-41b6-b29c-f48260cf4d99': 'RELIC_CINDER_LANTERN',
    '698aafea-b013-44d1-8a0d-2ebcb29e6e2e': 'AMULET_OBSIDIAN_HEART',
    'b3edee38-505c-4c85-ac1e-8f7ee796b996': 'RING_BLAZING_SUN',

    // Exact matches from economy_transactions (Enhancements)
    '7ddba13d-bd28-4f97-a198-28d04029b42e': 'WEAPON_CALIDOS_GAUNTLETS', // enhanced to +4 and +10

    // Boss Signature Drops (100% first clear drop rate on boss floors)
    '7cd9495f-c379-49d8-b385-5fe066b214a3': 'RELIC_FIRE_BRIGADE_BADGE', // Floor 5 boss (Maki Oze)
    'f576410b-4d30-41d0-acb4-628806e209bf': 'WEAPON_CRIMSON_CHANT_STAFF', // Floor 10 boss (Megumin)
    'f46abb1f-6acb-4b5e-954f-cefe6f543787': 'ARMOR_CRUSADER_PLATE', // Floor 15 boss (Darkness)
    '30fceb0b-c7f5-490c-bae7-009d6ef78e98': 'TALISMAN_MANEUVER_GEAR', // Floor 20 boss (Mikasa)
    '56f060f6-d73c-4f3d-802b-d2f5a64d5ec3': 'RING_SWORD_SAINT_BAND', // Floor 25 boss (Eris)
    '20cdb370-95da-4d9e-a7d5-9277ee981675': 'AMULET_HARVEST_POUCH', // Floor 35 boss (Holo)
    '39aedc1d-7478-4245-8e84-dd6ac39da5bd': 'RING_RUIN_SIGNET', // Floor 40 boss (Rias)
    'e1a973ae-ca1b-421c-8ba0-89a71aa8a9e2': 'ARMOR_CHAOS_DRAGON_SCALE', // Floor 45 boss (Tohru)

    // Bracket-Constrained Unique Slot Drops
    '975782ef-0ec4-44a3-b498-8f5fd091c214': 'RELIC_EMBER_CHARM', // Floor 2 (Only new relic in Bracket 1-9)
    '54741231-5686-44e5-838e-c2a121857db7': 'RELIC_PHOENIX_ASH_CENSER', // Floor 24 (Only relic in Bracket 20-29)
    '4c85c9a4-0e5b-4970-a58b-3de4a101edf8': 'AMULET_MAGMA_CORE', // Floor 32 (Only amulet in Bracket 30-39)
    'e5c7008e-470d-472c-acd3-58b8a44282e2': 'ARMOR_ETERNAL_CRUCIBLE', // Floor 42 (Only armor in Bracket 40+)

    // Bracket 20-29 and 40+ remaining drops
    '64d7e979-b7e3-4fe9-a5fc-128b1d9f3a33': 'RING_SOLAR_FLARE', // Bracket 20-29 accessory
    '9380ba06-1510-4c40-bd49-ec263afd8479': 'TALISMAN_EMBERSTEP', // Bracket 20-29 accessory
    '24a98385-a551-4fbf-afa0-d108f3e79ca7': 'RING_SUNFORGED_SIGIL', // Bracket 40+ accessory
  };

  interface InventoryRow {
    id: string;
    user_id: string;
    item_id: string;
    quantity: number;
  }

  interface CountRow {
    c: number;
  }

  const allInv = raw.prepare(`SELECT * FROM user_inventory_items`).all() as InventoryRow[];
  console.log(`Processing ${allInv.length} inventory items across all users...`);

  let updatedCount = 0;
  let skippedCount = 0;

  const updateStmt = raw.prepare(`UPDATE user_inventory_items SET item_id = ? WHERE id = ?`);

  const executeUpdates = raw.transaction(() => {
    for (const inv of allInv) {
      const code = oldUuidToCode[inv.item_id];
      if (!code) {
        throw new Error(`Unmapped old item_id: ${inv.item_id}`);
      }
      const newId = codeToCurrentId.get(code);
      if (!newId) {
        throw new Error(`Missing active game_items row for code: ${code}`);
      }

      if (inv.item_id === newId) {
        skippedCount++;
        continue;
      }

      if (!isDryRun) {
        updateStmt.run(newId, inv.id);
      }
      updatedCount++;
    }
  });

  executeUpdates();

  console.log(`\nRecovery Summary:`);
  console.log(`  • Items needing remap: ${updatedCount}`);
  console.log(`  • Items already matching: ${skippedCount}`);
  console.log(`  • Total items verified: ${updatedCount + skippedCount} / ${allInv.length}`);

  if (!isDryRun) {
    // Verification query
    const verified = (
      raw
        .prepare(
          `
      SELECT count(1) as c 
      FROM user_inventory_items uii 
      JOIN game_items gi ON uii.item_id = gi.id
    `,
        )
        .get() as CountRow
    ).c;
    console.log(`\nPost-Recovery Database Verification:`);
    console.log(`  • Valid active items: ${verified} / ${allInv.length}`);
    if (verified === allInv.length) {
      console.log(`  ✨ All player items successfully restored!`);
    } else {
      console.warn(`  ⚠️ Warning: Mismatch detected.`);
    }
  }

  await currentDb.close();
  await backupDb.close();
}

main().catch(console.error);
