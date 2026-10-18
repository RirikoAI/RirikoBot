import type { EventBus } from '@ririko/core';

export interface MaintenanceServiceOptions {
  /** Initial maintenance state. Defaults to process.env.MAINTENANCE_MODE === 'true'. */
  initialState?: boolean | undefined;
  /** Event bus for broadcasting maintenance state changes. */
  eventBus?: EventBus | undefined;
  /** Default maintenance message or reason. */
  defaultReason?: string | undefined;
}

export interface MaintenanceStatus {
  enabled: boolean;
  reason?: string | undefined;
  updatedAt?: Date | undefined;
  changedBy?: string | undefined;
}

/**
 * Service managing bot-wide maintenance mode state.
 * Emits typed events on state changes and integrates with CommandRouter middleware.
 */
export class MaintenanceService {
  private enabled: boolean;
  private reason?: string | undefined;
  private updatedAt?: Date | undefined;
  private changedBy?: string | undefined;
  private readonly eventBus?: EventBus | undefined;

  constructor(options: MaintenanceServiceOptions = {}) {
    this.enabled =
      options.initialState ??
      (typeof process !== 'undefined' && process.env.MAINTENANCE_MODE === 'true');
    this.reason = options.defaultReason;
    this.eventBus = options.eventBus;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getReason(): string | undefined {
    return this.reason;
  }

  public getStatus(): MaintenanceStatus {
    return {
      enabled: this.enabled,
      reason: this.reason,
      updatedAt: this.updatedAt,
      changedBy: this.changedBy,
    };
  }

  public enable(reason?: string, changedBy?: string): void {
    this.enabled = true;
    this.reason = reason;
    this.updatedAt = new Date();
    this.changedBy = changedBy;

    this.eventBus?.emit('bot:maintenanceChanged', {
      enabled: true,
      reason,
      changedBy,
    });
  }

  public disable(changedBy?: string): void {
    this.enabled = false;
    this.reason = undefined;
    this.updatedAt = new Date();
    this.changedBy = changedBy;

    this.eventBus?.emit('bot:maintenanceChanged', {
      enabled: false,
      reason: undefined,
      changedBy,
    });
  }

  public toggle(reason?: string, changedBy?: string): boolean {
    if (this.enabled) {
      this.disable(changedBy);
      return false;
    }
    this.enable(reason, changedBy);
    return true;
  }
}
