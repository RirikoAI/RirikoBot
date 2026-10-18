import { Command } from 'commander';
import { runDiagnostics } from '../doctor/engine.js';

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run comprehensive environment, database, and integration health diagnostics')
    .action(async () => {
      const report = await runDiagnostics();
      if (!report.isHealthy) {
        process.exitCode = 1;
      }
    });
}
