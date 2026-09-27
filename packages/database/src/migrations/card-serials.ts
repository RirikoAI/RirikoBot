import { sql } from 'drizzle-orm';
import type { DatabaseClient } from '../client/types.js';
import { withTransaction } from '../transactions/index.js';

/** Refuse ambiguous legacy serials rather than silently renumbering or discarding owned cards. */
export async function ensureCardSerialSchema(client: DatabaseClient): Promise<void> {
  await withTransaction(client, async (tx) => {
    if (tx.dialect === 'postgres') {
      await tx.db.execute(sql`SELECT pg_advisory_xact_lock(1703, 1)`);
      await tx.db.execute(sql`LOCK TABLE user_cards IN SHARE ROW EXCLUSIVE MODE`);
    }
    const audit = sql`SELECT card_id, serial_number FROM user_cards GROUP BY card_id, serial_number HAVING count(*) > 1 LIMIT 1`;
    const duplicates =
      tx.dialect === 'sqlite' ? tx.db.all(audit) : (await tx.db.execute(audit)).rows;
    if (duplicates.length)
      throw new Error(
        'Duplicate owned-card serials require an explicit repair before enabling adventure. No cards were changed.',
      );
    const statements = [
      'CREATE TABLE IF NOT EXISTS waifu_card_serials (card_id TEXT PRIMARY KEY NOT NULL, next_serial INTEGER NOT NULL)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_cards_serial_unique ON user_cards(card_id, serial_number)',
    ];
    for (const statement of statements) {
      if (tx.dialect === 'sqlite') tx.raw.exec(statement);
      else await tx.db.execute(sql.raw(statement));
    }
  });
}
