import { CORE_VERSION, RirikoError } from '@ririko/core';
import { Command } from 'commander';
import pc from 'picocolors';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerInfoCommand } from './commands/info.js';
import { registerMigrateCommand } from './commands/migrate.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('ririko')
    .description('Ririko AI 2.0.0 Operator and Developer CLI')
    .version(CORE_VERSION, '-v, --version', 'Output the current version')
    .option('--verbose', 'Enable detailed verbose logging')
    .option('--config <path>', 'Path to custom environment file (.env)');

  // Register commands
  registerInfoCommand(program);
  registerDoctorCommand(program);
  registerMigrateCommand(program);

  // Global error handler
  program.exitOverride();

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();

  try {
    await program.parseAsync(argv);
  } catch (err: unknown) {
    // Let commander handle standard exit calls (like --help or --version)
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code: string }).code;
      if (code === 'commander.helpDisplayed' || code === 'commander.version') {
        return;
      }
    }

    if (err instanceof RirikoError) {
      console.error(pc.red(`\n✖ [${err.code}] ${err.message}`));
      if (err.details) {
        console.error(pc.gray(JSON.stringify(err.details, null, 2)));
      }
      process.exit(1);
    }

    if (err instanceof Error) {
      console.error(pc.red(`\n✖ Unexpected Error: ${err.message}`));
      if (process.env.DEBUG || process.argv.includes('--verbose')) {
        console.error(pc.gray(err.stack ?? ''));
      }
      process.exit(1);
    }

    console.error(pc.red('\n✖ Unknown fatal error occurred.'));
    process.exit(1);
  }
}
