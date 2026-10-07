import type { DatabaseClient } from '../client/types.js';

/** A PostgreSQL id column that holds ids SQLite also holds, which are not always uuids. */
interface TextIdColumn {
  readonly table: string;
  readonly column: string;
  /** A primary key keeps a random-uuid default, as text. */
  readonly primaryKey: boolean;
}

const key = (table: string, column: string): TextIdColumn => ({ table, column, primaryKey: true });
const reference = (table: string, column: string): TextIdColumn => ({
  table,
  column,
  primaryKey: false,
});

/**
 * Columns that were `uuid` in PostgreSQL before BUG-0038 and are `text` now, so both dialects
 * hold the same ids: slug card ids (`card_fire_001`), asset ids (`asset_card_bulk_fire_001`),
 * item ids (`candy_minor`) and prefixed AI ids (`conv_<uuid>`, `msg_<uuid>`). Keep it equal to
 * the `text` columns the PostgreSQL schema declares (`text-ids.test.ts` checks that).
 */
export const TEXT_ID_COLUMNS: readonly TextIdColumn[] = [
  key('waifu_assets', 'id'),
  key('waifu_cards', 'id'),
  reference('waifu_cards', 'asset_id'),
  reference('user_cards', 'card_id'),
  reference('dungeon_bosses', 'asset_id'),
  reference('game_achievements', 'reward_card_id'),
  reference('game_achievements', 'reward_item_id'),
  reference('quests', 'reward_card_id'),
  key('economy_items', 'id'),
  reference('economy_inventories', 'item_id'),
  key('ai_conversations', 'id'),
  key('ai_messages', 'id'),
  reference('ai_messages', 'conversation_id'),
];

const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

/**
 * Upgrades a PostgreSQL schema created before BUG-0038: every column of `TEXT_ID_COLUMNS` that is
 * still `uuid` becomes `text`, keeping each value in its text form. It runs under one
 * transaction-wide advisory lock, so the bot and the dashboard may start together, and a second
 * run finds nothing to change. A uuid default cannot be cast, so a primary key drops it first and
 * gets the text default back afterwards. Does nothing on SQLite, whose ids were always text.
 * Returns the `table.column` names it changed.
 */
export async function ensureTextIdColumns(client: DatabaseClient): Promise<string[]> {
  if (client.dialect !== 'postgres') return [];
  const connection = await client.raw.connect();
  try {
    await connection.query('BEGIN');
    try {
      await connection.query('SELECT pg_advisory_xact_lock(1704, 1)');
      const { rows } = await connection.query<{
        table_name: string;
        column_name: string;
        data_type: string;
      }>(
        `SELECT table_name, column_name, data_type FROM information_schema.columns
          WHERE table_schema = current_schema() AND data_type = 'uuid'`,
      );
      const legacy = new Set(
        rows
          .filter((row) => row.data_type === 'uuid')
          .map((row) => `${row.table_name}.${row.column_name}`),
      );
      const changed: string[] = [];
      for (const { table, column, primaryKey } of TEXT_ID_COLUMNS) {
        if (!legacy.has(`${table}.${column}`)) continue;
        // Static names from TEXT_ID_COLUMNS, no user input.
        const target = `ALTER TABLE ${quote(table)} ALTER COLUMN ${quote(column)}`;
        await connection.query(`${target} DROP DEFAULT`);
        await connection.query(`${target} TYPE text USING ${quote(column)}::text`);
        if (primaryKey) await connection.query(`${target} SET DEFAULT gen_random_uuid()::text`);
        changed.push(`${table}.${column}`);
      }
      await connection.query('COMMIT');
      return changed;
    } catch (error) {
      await connection.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    connection.release();
  }
}
