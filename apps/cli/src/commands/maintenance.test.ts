import { describe, it, expect } from 'vitest';
import { MaintenanceService } from '@ririko/services';
import { runMaintenanceCommand } from './maintenance.js';

describe('bot:maintenance CLI command', () => {
  it('displays status when action is "status"', () => {
    const service = new MaintenanceService({ initialState: false });
    const lines = runMaintenanceCommand(service, 'status');
    expect(lines.join('\n')).toContain('Bot Maintenance Status');
    expect(lines.join('\n')).toContain('DISABLED');

    service.enable('Scheduled maintenance');
    const activeLines = runMaintenanceCommand(service, 'status');
    expect(activeLines.join('\n')).toContain('ENABLED');
    expect(activeLines.join('\n')).toContain('Scheduled maintenance');
  });

  it('enables maintenance mode with reason', () => {
    const service = new MaintenanceService({ initialState: false });
    const lines = runMaintenanceCommand(service, 'on', { reason: 'Patching dependencies' });
    expect(service.isEnabled()).toBe(true);
    expect(lines.join('\n')).toContain('Maintenance mode ENABLED');
    expect(lines.join('\n')).toContain('Patching dependencies');
  });

  it('disables maintenance mode', () => {
    const service = new MaintenanceService({ initialState: true });
    const lines = runMaintenanceCommand(service, 'off');
    expect(service.isEnabled()).toBe(false);
    expect(lines.join('\n')).toContain('Maintenance mode DISABLED');
  });

  it('toggles maintenance mode', () => {
    const service = new MaintenanceService({ initialState: false });
    const lines1 = runMaintenanceCommand(service, 'toggle');
    expect(service.isEnabled()).toBe(true);
    expect(lines1.join('\n')).toContain('ENABLED');

    const lines2 = runMaintenanceCommand(service, 'toggle');
    expect(service.isEnabled()).toBe(false);
    expect(lines2.join('\n')).toContain('DISABLED');
  });

  it('throws ValidationError on unrecognized action', () => {
    const service = new MaintenanceService();
    expect(() => runMaintenanceCommand(service, 'invalid_action')).toThrow(
      'Unknown maintenance action',
    );
  });
});
