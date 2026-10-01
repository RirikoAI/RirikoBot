import { ValidationError } from '@ririko/core';
import { MaintenanceService } from '@ririko/services';
import type { Command } from 'commander';
import pc from 'picocolors';

export interface MaintenanceCommandOptions {
  reason?: string | undefined;
}

/**
 * Executes the `ririko bot:maintenance` logic and returns lines to print.
 */
export function runMaintenanceCommand(
  service: MaintenanceService,
  action: string = 'status',
  options: MaintenanceCommandOptions = {},
): string[] {
  const normalizedAction = action.toLowerCase().trim();

  switch (normalizedAction) {
    case 'status': {
      const status = service.getStatus();
      return [
        pc.bold('🛠️  Bot Maintenance Status'),
        `  State:  ${status.enabled ? pc.red(pc.bold('ENABLED (Active)')) : pc.green(pc.bold('DISABLED (Normal Operations)'))}`,
        status.reason ? `  Reason: ${pc.yellow(status.reason)}` : `  Reason: ${pc.gray('(none)')}`,
      ];
    }
    case 'on':
    case 'enable': {
      service.enable(options.reason ?? 'Maintenance mode enabled via CLI', 'cli');
      return [
        `${pc.green('✔')} ${pc.bold('Maintenance mode ENABLED.')}`,
        options.reason
          ? `  Reason: ${options.reason}`
          : '  Non-developer commands will be temporarily blocked.',
      ];
    }
    case 'off':
    case 'disable': {
      service.disable('cli');
      return [
        `${pc.green('✔')} ${pc.bold('Maintenance mode DISABLED.')}`,
        '  Normal command routing resumed.',
      ];
    }
    case 'toggle': {
      const nowActive = service.toggle(options.reason ?? 'Toggled via CLI', 'cli');
      return [
        `${pc.green('✔')} ${pc.bold(`Maintenance mode ${nowActive ? 'ENABLED' : 'DISABLED'}.`)}`,
      ];
    }
    default:
      throw new ValidationError(`Unknown maintenance action "${action}".`, {
        validationErrors: ['Valid actions: status, on, off, toggle'],
      });
  }
}

/**
 * Registers `ririko bot:maintenance` into the Commander program.
 */
export function registerMaintenanceCommand(program: Command): void {
  program
    .command('bot:maintenance')
    .argument('[action]', 'Action to perform: status, on, off, toggle (default: status)', 'status')
    .description('View or update bot maintenance mode')
    .option('-r, --reason <text>', 'Reason for entering maintenance mode')
    .action((action: string, opts: MaintenanceCommandOptions) => {
      const service = new MaintenanceService();
      const lines = runMaintenanceCommand(service, action, opts);
      for (const line of lines) {
        console.log(line);
      }
    });
}
