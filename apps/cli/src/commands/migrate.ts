import { Command } from 'commander';
import pc from 'picocolors';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabaseClient, migration } from '@ririko/database';

export function registerMigrateCommand(program: Command): void {
  program
    .command('migrate:legacy')
    .description('Migrate production data from a 1.4.0 legacy SQLite database to 2.0.0')
    .option(
      '-s, --source <path>',
      'Path to legacy 1.4.0 SQLite database file',
      './data/legacy-ririko.sqlite',
    )
    .option(
      '-t, --target <url>',
      'Target database URL (e.g. postgres://... or sqlite path)',
      './data/ririko.sqlite',
    )
    .option(
      '--dry-run',
      'Perform read-only pre-flight inspection and transformation without modifying target DB',
      false,
    )
    .option(
      '-b, --batch-size <number>',
      'Batch size for chunked database insertions',
      (val) => parseInt(val, 10),
      500,
    )
    .action(async (options) => {
      const sourcePath = resolve(process.cwd(), options.source);
      if (!existsSync(sourcePath)) {
        console.error(pc.red(`\n✖ Source database file not found at: ${sourcePath}`));
        process.exit(1);
      }

      console.log(pc.cyan(`\n╭──────────────────────────────────────────────────╮`));
      console.log(pc.cyan(`│   Ririko 2.0 Migration Engine (1.4.0 -> 2.0.0)    │`));
      console.log(pc.cyan(`╰──────────────────────────────────────────────────╯\n`));

      console.log(`  ${pc.bold('Source Database')}: ${pc.gray(sourcePath)}`);
      console.log(`  ${pc.bold('Target Database')}: ${pc.gray(options.target)}`);
      console.log(
        `  ${pc.bold('Execution Mode')}:  ${
          options.dryRun
            ? pc.yellow(pc.bold('DRY RUN (Read-Only)'))
            : pc.green(pc.bold('LIVE EXECUTION'))
        }\n`,
      );

      const targetDialect = options.target.startsWith('postgres') ? 'postgres' : 'sqlite';
      const targetClient = await createDatabaseClient({
        dialect: targetDialect,
        url: options.target,
      });

      try {
        const engine = new migration.MigrationEngine();
        const result = await engine.migrate(sourcePath, targetClient, {
          dryRun: options.dryRun,
          batchSize: options.batchSize,
        });

        console.log(pc.bold('─── Pre-Flight Legacy Audit ───────────────────────'));
        console.log(`  Total Legacy Users:  ${pc.cyan(result.inspected.totalUsers)}`);
        console.log(`  Total Legacy Guilds: ${pc.cyan(result.inspected.totalGuilds)}`);
        console.log(`  Total Legacy Coins:  ${pc.yellow(result.inspected.totalCoins.toString())}`);
        console.log(
          `  Total Legacy Karma:  ${pc.magenta(result.inspected.totalKarma.toString())}\n`,
        );

        console.log(pc.bold('─── Transformed Entity Counts ─────────────────────'));
        for (const [entity, count] of Object.entries(result.migratedCounts)) {
          if (count > 0) {
            console.log(`  ✔ ${entity.padEnd(24)} ${pc.green(count.toString())}`);
          }
        }

        console.log(pc.bold('\n─── Financial Integrity & Conservation ────────────'));
        if (result.coinsConserved) {
          console.log(
            `  ✔ Currency Sum Conservation: ${pc.green(
              `PASSED (100% exact match: ${result.totalCoinsMigrated.toString()} credits)`,
            )}`,
          );
        } else {
          console.log(
            `  ✖ Currency Sum Conservation: ${pc.red(
              `FAILED (Legacy: ${result.inspected.totalCoins}, Target: ${result.totalCoinsMigrated})`,
            )}`,
          );
        }

        console.log(`\n  ${pc.bold('Batch ID')}:  ${pc.gray(result.batchId)}`);
        console.log(`  ${pc.bold('Duration')}:  ${pc.cyan(result.durationMs)}ms`);

        if (options.dryRun) {
          console.log(
            pc.yellow(`\n✔ Dry-run complete. Zero modifications were made to the target database.`),
          );
        } else {
          console.log(pc.green(`\n✔ Migration completed successfully with zero data loss!`));
        }
      } finally {
        await targetClient.close();
      }
    });

  program
    .command('migrate:verify')
    .description('Verify integrity between legacy SQLite database and 2.0.0 target database')
    .option(
      '-s, --source <path>',
      'Path to legacy 1.4.0 SQLite database file',
      './data/legacy-ririko.sqlite',
    )
    .option('-t, --target <url>', 'Target database URL', './data/ririko.sqlite')
    .action(async (options) => {
      const sourcePath = resolve(process.cwd(), options.source);
      if (!existsSync(sourcePath)) {
        console.error(pc.red(`\n✖ Source database file not found at: ${sourcePath}`));
        process.exit(1);
      }

      const targetDialect = options.target.startsWith('postgres') ? 'postgres' : 'sqlite';
      const targetClient = await createDatabaseClient({
        dialect: targetDialect,
        url: options.target,
      });

      try {
        const engine = new migration.MigrationEngine();
        const report = await engine.verify(sourcePath, targetClient);

        console.log(pc.bold('\n─── Migration Data Verification ───────────────────'));
        console.log(`  Status:       ${report.ok ? pc.green('VERIFIED OK') : pc.red('FAILED')}`);
        console.log(`  Legacy Coins: ${pc.yellow(report.legacyCoins.toString())}`);
        console.log(`  Target Coins: ${pc.yellow(report.targetCoins.toString())}`);
        console.log(`  Legacy Users: ${pc.cyan(report.legacyUsers)}`);
        console.log(`  Target Users: ${pc.cyan(report.targetUsers)}`);
        console.log(`  Message:      ${pc.gray(report.message)}\n`);

        if (!report.ok) {
          process.exit(1);
        }
      } finally {
        await targetClient.close();
      }
    });
}
