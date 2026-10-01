import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@ririko/core';
import { MaintenanceService } from '../maintenance.service.js';

describe('MaintenanceService', () => {
  it('initializes with default disabled state or environment override', () => {
    const service = new MaintenanceService({ initialState: false });
    expect(service.isEnabled()).toBe(false);
    expect(service.getReason()).toBeUndefined();
    expect(service.getStatus().enabled).toBe(false);

    const activeService = new MaintenanceService({
      initialState: true,
      defaultReason: 'Routine server upgrade',
    });
    expect(activeService.isEnabled()).toBe(true);
    expect(activeService.getReason()).toBe('Routine server upgrade');
  });

  it('enables maintenance mode and emits event', () => {
    const eventBus = new EventBus();
    const emitSpy = vi.spyOn(eventBus, 'emit');
    const service = new MaintenanceService({ initialState: false, eventBus });

    service.enable('Database migration', 'admin-user');
    expect(service.isEnabled()).toBe(true);
    expect(service.getReason()).toBe('Database migration');

    const status = service.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.reason).toBe('Database migration');
    expect(status.changedBy).toBe('admin-user');
    expect(status.updatedAt).toBeInstanceOf(Date);

    expect(emitSpy).toHaveBeenCalledWith('bot:maintenanceChanged', {
      enabled: true,
      reason: 'Database migration',
      changedBy: 'admin-user',
    });
  });

  it('disables maintenance mode and emits event', () => {
    const eventBus = new EventBus();
    const emitSpy = vi.spyOn(eventBus, 'emit');
    const service = new MaintenanceService({ initialState: true, eventBus });

    service.disable('admin-user');
    expect(service.isEnabled()).toBe(false);
    expect(service.getReason()).toBeUndefined();

    const status = service.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.reason).toBeUndefined();
    expect(status.changedBy).toBe('admin-user');

    expect(emitSpy).toHaveBeenCalledWith('bot:maintenanceChanged', {
      enabled: false,
      reason: undefined,
      changedBy: 'admin-user',
    });
  });

  it('toggles maintenance mode back and forth', () => {
    const service = new MaintenanceService({ initialState: false });

    const toggledOn = service.toggle('Emergency fix');
    expect(toggledOn).toBe(true);
    expect(service.isEnabled()).toBe(true);
    expect(service.getReason()).toBe('Emergency fix');

    const toggledOff = service.toggle();
    expect(toggledOff).toBe(false);
    expect(service.isEnabled()).toBe(false);
  });
});
