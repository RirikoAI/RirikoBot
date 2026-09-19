import fs from 'node:fs';
import path from 'node:path';
import { createDatabaseClient } from '../packages/database/src/index.js';

// Simple .env parser for standalone script execution
function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

async function main(): Promise<void> {
  const userId = process.argv[2]?.trim();

  if (!userId) {
    console.error('❌ Error: Discord User ID must be provided.');
    console.log('\nUsage:');
    console.log('  pnpm tcg:reset-user <discord_user_id>');
    console.log('  tsx scripts/reset-tcg-user.ts <discord_user_id>\n');
    console.log('Example:');
    console.log('  pnpm tcg:reset-user 1257377848671600722\n');
    process.exit(1);
  }

  console.log('🔄 ===================================================');
  console.log('🔄 Ririko AI 2.0.0 — Reset User Waifu TCG Progress');
  console.log('🔄 ===================================================\n');
  console.log(`• Target User ID: ${userId}`);

  const dialect = (process.env.DATABASE_DIALECT as 'sqlite' | 'postgres') || 'sqlite';
  const url = process.env.DATABASE_URL || './data/ririko.sqlite';

  console.log(`• Dialect: ${dialect}`);
  console.log(`• Database URL: ${url}\n`);

  const dbClient = await createDatabaseClient({
    dialect,
    url,
    autoMigrate: false,
  });

  const ping = await dbClient.ping();
  if (!ping.ok) {
    throw new Error(`Database ping failed: ${ping.error}`);
  }

  const results: { table: string; changes: number }[] = [];

  if (dbClient.dialect === 'sqlite') {
    const rawDb = dbClient.raw;

    // Execute in a single SQLite transaction
    const executeCleanup = rawDb.transaction(() => {
      // 1. Handle any guilds led by the user
      const ledGuilds = rawDb
        .prepare('SELECT id FROM waifu_guilds WHERE leader_user_id = ?')
        .all(userId) as { id: string }[];

      if (ledGuilds.length > 0) {
        const guildIds = ledGuilds.map((g) => g.id);
        for (const gId of guildIds) {
          rawDb.prepare('DELETE FROM waifu_guild_members WHERE guild_id = ?').run(gId);
        }
        const delGuilds = rawDb
          .prepare('DELETE FROM waifu_guilds WHERE leader_user_id = ?')
          .run(userId);
        results.push({ table: 'waifu_guilds (led by user)', changes: delGuilds.changes });
      }

      // 2. Market listings created by user
      const delMarket = rawDb
        .prepare('DELETE FROM market_listings WHERE seller_user_id = ?')
        .run(userId);
      results.push({ table: 'market_listings', changes: delMarket.changes });

      // 3. Card trades involving user
      const delTrades = rawDb
        .prepare('DELETE FROM card_trades WHERE sender_user_id = ? OR receiver_user_id = ?')
        .run(userId, userId);
      results.push({ table: 'card_trades', changes: delTrades.changes });

      // 4. User inventory items
      const delInventory = rawDb
        .prepare('DELETE FROM user_inventory_items WHERE user_id = ?')
        .run(userId);
      results.push({ table: 'user_inventory_items', changes: delInventory.changes });

      // 5. User cards
      const delCards = rawDb.prepare('DELETE FROM user_cards WHERE user_id = ?').run(userId);
      results.push({ table: 'user_cards', changes: delCards.changes });

      // 6. Player energy
      const delEnergy = rawDb
        .prepare('DELETE FROM player_energy WHERE user_id = ?')
        .run(userId);
      results.push({ table: 'player_energy', changes: delEnergy.changes });

      // 7. User dungeon progress
      const delDungeon = rawDb
        .prepare('DELETE FROM user_dungeon_progress WHERE user_id = ?')
        .run(userId);
      results.push({ table: 'user_dungeon_progress', changes: delDungeon.changes });

      // 8. User achievements
      const delAchievements = rawDb
        .prepare('DELETE FROM user_achievements WHERE user_id = ?')
        .run(userId);
      results.push({ table: 'user_achievements', changes: delAchievements.changes });

      // 9. Guild memberships
      const delGuildMembers = rawDb
        .prepare('DELETE FROM waifu_guild_members WHERE user_id = ?')
        .run(userId);
      results.push({ table: 'waifu_guild_members', changes: delGuildMembers.changes });

      // 10. Boss runs
      const delBossRuns = rawDb
        .prepare('DELETE FROM boss_runs WHERE user_id = ?')
        .run(userId);
      results.push({ table: 'boss_runs', changes: delBossRuns.changes });

      // 11. TCG system configs (tutorial metadata, rewards)
      const delConfigs = rawDb
        .prepare('DELETE FROM tcg_system_configs WHERE key LIKE ?')
        .run(`%:${userId}`);
      results.push({ table: 'tcg_system_configs', changes: delConfigs.changes });
    });

    try {
      executeCleanup();
    } catch (err) {
      console.error('❌ Failed to execute cleanup transaction:', err);
      await dbClient.close();
      process.exit(1);
    }

    console.log('✅ Successfully executed cleanup transaction:');
    for (const r of results) {
      console.log(`  • ${r.table}: ${r.changes} row(s) deleted`);
    }

    // Verification queries
    console.log('\n🔍 Verifying remaining records:');
    const verificationTables = [
      { name: 'user_cards', sql: 'SELECT count(*) as count FROM user_cards WHERE user_id = ?' },
      {
        name: 'user_inventory_items',
        sql: 'SELECT count(*) as count FROM user_inventory_items WHERE user_id = ?',
      },
      {
        name: 'player_energy',
        sql: 'SELECT count(*) as count FROM player_energy WHERE user_id = ?',
      },
      {
        name: 'user_dungeon_progress',
        sql: 'SELECT count(*) as count FROM user_dungeon_progress WHERE user_id = ?',
      },
      {
        name: 'user_achievements',
        sql: 'SELECT count(*) as count FROM user_achievements WHERE user_id = ?',
      },
      {
        name: 'card_trades',
        sql: 'SELECT count(*) as count FROM card_trades WHERE sender_user_id = ? OR receiver_user_id = ?',
        params: [userId, userId],
      },
      {
        name: 'market_listings',
        sql: 'SELECT count(*) as count FROM market_listings WHERE seller_user_id = ?',
      },
      {
        name: 'waifu_guild_members',
        sql: 'SELECT count(*) as count FROM waifu_guild_members WHERE user_id = ?',
      },
      {
        name: 'boss_runs',
        sql: 'SELECT count(*) as count FROM boss_runs WHERE user_id = ?',
      },
      {
        name: 'tcg_system_configs',
        sql: 'SELECT count(*) as count FROM tcg_system_configs WHERE key LIKE ?',
        params: [`%:${userId}`],
      },
    ];

    let allZero = true;
    for (const v of verificationTables) {
      const params = v.params ?? [userId];
      const row = rawDb.prepare(v.sql).get(...params) as { count: number };
      const status = row.count === 0 ? '✓ 0 remaining' : `⚠️ ${row.count} remaining`;
      console.log(`  • ${v.name}: ${status}`);
      if (row.count > 0) allZero = false;
    }

    await dbClient.close();

    if (allZero) {
      console.log(`\n✨ User ${userId} has been completely reset to fresh onboarding state!`);
    } else {
      console.warn('\n⚠️ Warning: Some records could not be deleted.');
    }
  } else {
    // PostgreSQL handling
    const pool = dbClient.raw;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const ledGuilds = await client.query(
        'SELECT id FROM waifu_guilds WHERE leader_user_id = $1',
        [userId],
      );
      if (ledGuilds.rows.length > 0) {
        for (const g of ledGuilds.rows) {
          await client.query('DELETE FROM waifu_guild_members WHERE guild_id = $1', [g.id]);
        }
        const delG = await client.query(
          'DELETE FROM waifu_guilds WHERE leader_user_id = $1',
          [userId],
        );
        results.push({ table: 'waifu_guilds', changes: delG.rowCount ?? 0 });
      }

      const qList = [
        { table: 'market_listings', sql: 'DELETE FROM market_listings WHERE seller_user_id = $1' },
        {
          table: 'card_trades',
          sql: 'DELETE FROM card_trades WHERE sender_user_id = $1 OR receiver_user_id = $1',
        },
        {
          table: 'user_inventory_items',
          sql: 'DELETE FROM user_inventory_items WHERE user_id = $1',
        },
        { table: 'user_cards', sql: 'DELETE FROM user_cards WHERE user_id = $1' },
        { table: 'player_energy', sql: 'DELETE FROM player_energy WHERE user_id = $1' },
        {
          table: 'user_dungeon_progress',
          sql: 'DELETE FROM user_dungeon_progress WHERE user_id = $1',
        },
        {
          table: 'user_achievements',
          sql: 'DELETE FROM user_achievements WHERE user_id = $1',
        },
        {
          table: 'waifu_guild_members',
          sql: 'DELETE FROM waifu_guild_members WHERE user_id = $1',
        },
        { table: 'boss_runs', sql: 'DELETE FROM boss_runs WHERE user_id = $1' },
        { table: 'tcg_system_configs', sql: "DELETE FROM tcg_system_configs WHERE key LIKE '%:' || $1" },
      ];

      for (const q of qList) {
        const res = await client.query(q.sql, [userId]);
        results.push({ table: q.table, changes: res.rowCount ?? 0 });
      }

      await client.query('COMMIT');

      console.log('✅ Successfully executed cleanup transaction:');
      for (const r of results) {
        console.log(`  • ${r.table}: ${r.changes} row(s) deleted`);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to execute cleanup transaction:', err);
      client.release();
      await dbClient.close();
      process.exit(1);
    } finally {
      client.release();
    }
    await dbClient.close();
  }
}

main().catch((err) => {
  console.error('\n✖ Reset script error:', err);
  process.exit(1);
});
