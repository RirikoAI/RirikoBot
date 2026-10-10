import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import type { PostgresDatabaseClient } from '../client/types.js';
import {
  BIG_BANK,
  BIG_WALLET,
  MOMENT,
  buildSource,
  readBack,
  sqlite,
} from '../testing/copy-fixture.js';
import { WaifuCardRepository } from '../repositories/waifu-card.repository.js';
import { PG_MIGRATIONS } from '../migrations/generated/pg.js';
import { MIGRATIONS_TABLE } from '../migrations/runner.js';
import { describeDialects } from '../testing/dialects.js';
import { copyDatabase } from './copy-database.js';

const directory = mkdtempSync(join(tmpdir(), 'ririko-copy-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const buildSourceIn = (name: string) => buildSource(directory, name);

/** Rows of the data tables; the migration records are the target's own, not copied data. */
async function totalRows(pg: PostgresDatabaseClient): Promise<number> {
  const { rows: tables } = await pg.raw.query<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
        AND table_name <> $1`,
    [MIGRATIONS_TABLE],
  );
  let total = 0;
  for (const { name } of tables) {
    const { rows } = await pg.raw.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${name}"`);
    total += Number(rows[0]!.n);
  }
  return total;
}

describeDialects('copyDatabase', (db) => {
  if (db.dialect === 'sqlite') {
    it('refuses a SQLite target', async () => {
      await expect(copyDatabase(join(directory, 'any.sqlite'), db.client as never)).rejects.toThrow(
        'The copy target must be a PostgreSQL database.',
      );
    });
    return;
  }

  const target = () => db.client as PostgresDatabaseClient;

  it('copies a bot database and reads back equal through the same repositories', async () => {
    const { path, source, cardId, expected } = await buildSourceIn('full');
    await source.close();

    const report = await copyDatabase(path, target());

    expect(report.committed).toBe(true);
    // The target was migrated by the runner, so it holds its own record of every migration.
    const recorded = await target().raw.query<{ id: string; adopted: boolean }>(
      `SELECT id, adopted FROM ${MIGRATIONS_TABLE} ORDER BY id`,
    );
    expect(recorded.rows).toEqual(PG_MIGRATIONS.map(({ id }) => ({ id, adopted: false })));
    expect(report.tables.map((table) => table.name)).not.toContain(MIGRATIONS_TABLE);
    expect(report.tables.length).toBeGreaterThan(90);
    expect(report.tables.every((table) => table.sourceRows === table.targetRows)).toBe(true);
    const rows = Object.fromEntries(report.tables.map((table) => [table.name, table.targetRows]));
    expect(rows).toMatchObject({
      users: 2,
      economy_balances: 3,
      economy_transactions: 1,
      user_cards: 2,
      waifu_cards: 1,
      waifu_card_serials: 1,
      economy_items: 1,
      economy_inventories: 1,
      ai_conversations: 1,
      ai_messages: 1,
      adventure_sessions: 1,
      adventure_choices: 1,
      guild_settings: 1,
    });
    expect(report.coinsChecked).toBe(true);
    // 1500 + 300 + 2^53 + 1 in wallets; 250 + 2^53 + 7 in banks.
    expect(report.coinTotals).toEqual({
      wallet: (BIG_WALLET + 1800n).toString(),
      bank: (BIG_BANK + 250n).toString(),
    });

    const actual = await readBack(target(), cardId);
    expect(actual.critRate).toBeCloseTo(expected.critRate, 5);
    expect({ ...actual, critRate: 0 }).toEqual({ ...expected, critRate: 0 });
    expect(actual.alice?.createdAt.getTime()).toBe(MOMENT.getTime());
    expect(actual.bob?.isBlacklisted).toBe(true);
    expect(actual.bobLedger[0]?.metadata).toEqual({ reason: 'seed', nested: { list: [1, 2, 3] } });
    expect(actual.guild?.noXpChannelIds).toEqual(['c1', 'c2']);
    expect(actual.adventureSettings).toEqual({ energyEnabled: false });

    // Values above 2^53 are exact: read them as text, never through a JavaScript number.
    const { rows: big } = await target().raw.query<{ wallet: string; bank: string }>(
      `SELECT wallet_balance::text AS wallet, bank_balance::text AS bank
         FROM economy_balances WHERE user_id = 'u3'`,
    );
    expect(big[0]).toEqual({ wallet: BIG_WALLET.toString(), bank: BIG_BANK.toString() });

    // The card serial counter came along, so the next minted card continues the numbering.
    expect(await new WaifuCardRepository(target()).reserveSerialNumber(cardId)).toBe(3);
  });

  it('rolls back on a dry run and leaves the target empty', async () => {
    const { path, source } = await buildSourceIn('dry');
    await source.close();

    const report = await copyDatabase(path, target(), { dryRun: true });

    expect(report.committed).toBe(false);
    expect(report.tables.find((table) => table.name === 'users')?.targetRows).toBe(2);
    expect(await totalRows(target())).toBe(0);
  });

  it('refuses a target that already has rows and changes nothing', async () => {
    const { path, source } = await buildSourceIn('twice');
    await source.close();
    await copyDatabase(path, target());
    const before = await totalRows(target());

    await expect(copyDatabase(path, target())).rejects.toThrow(/The target is not empty \(/);

    expect(await totalRows(target())).toBe(before);
  });

  it('refuses a source column the target does not have and writes nothing', async () => {
    const { path, source } = await buildSourceIn('extra-column');
    sqlite(source).raw.exec('ALTER TABLE users ADD COLUMN legacy_flag INTEGER');
    await source.close();

    await expect(copyDatabase(path, target())).rejects.toThrow(
      'Source column "users.legacy_flag" has no column in the target.',
    );

    expect(await totalRows(target())).toBe(0);
  });

  it('refuses a source table the target does not have and writes nothing', async () => {
    const { path, source } = await buildSourceIn('extra-table');
    sqlite(source).raw.exec('CREATE TABLE legacy_leftover (id TEXT)');
    await source.close();

    await expect(copyDatabase(path, target())).rejects.toThrow(
      'Source table "legacy_leftover" has no table in the target.',
    );

    expect(await totalRows(target())).toBe(0);
  });

  it('rolls back everything when one row is rejected by PostgreSQL', async () => {
    const { path, source } = await buildSourceIn('bad-row');
    // Longer than users.id (varchar(32)) in PostgreSQL; SQLite accepts it.
    sqlite(source)
      .raw.prepare('INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('x'.repeat(40), 'too-long', 1_700_000_000_000, 1_700_000_000_000);
    await source.close();

    await expect(copyDatabase(path, target())).rejects.toThrow(/Inserting into users failed/);

    // economy_balances and others sort before users and were written first.
    expect(await totalRows(target())).toBe(0);
  });

  it('moves identity sequences to the highest copied value', async () => {
    const { path, source } = await buildSourceIn('sequence');
    sqlite(source).raw.exec('CREATE TABLE ririko_copy_probe (id INTEGER, label TEXT NOT NULL)');
    sqlite(source).raw.exec(
      "INSERT INTO ririko_copy_probe VALUES (5, 'five'), (9, 'nine'), (7, 'seven')",
    );
    await source.close();
    await target().raw.query(
      'CREATE TABLE ririko_copy_probe (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, label text NOT NULL)',
    );

    try {
      const report = await copyDatabase(path, target());

      expect(report.sequences).toEqual([{ table: 'ririko_copy_probe', column: 'id', value: '9' }]);
      expect(report.tables.find((table) => table.name === 'ririko_copy_probe')).toEqual({
        name: 'ririko_copy_probe',
        sourceRows: 3,
        targetRows: 3,
      });
      const { rows } = await target().raw.query<{ id: number }>(
        "INSERT INTO ririko_copy_probe (label) VALUES ('next') RETURNING id",
      );
      expect(rows[0]!.id).toBe(10);
    } finally {
      await target().raw.query('DROP TABLE IF EXISTS ririko_copy_probe');
    }
  });
});
