/**
 * Core event map defining standard events across Ririko AI 2.0 subsystems.
 */
export type CoreEvents = {
  // System lifecycle
  'system:ready': {
    timestamp: Date;
    version: string;
    environment: string;
  };
  'system:shutdown': {
    reason: string;
    exitCode: number;
  };

  // Guild lifecycle
  'guild:joined': {
    guildId: string;
    name: string;
  };
  'guild:left': {
    guildId: string;
    name: string;
  };

  // Command execution
  'command:executed': {
    commandName: string;
    userId: string;
    guildId?: string;
    durationMs: number;
  };
  'command:error': {
    commandName: string;
    userId: string;
    guildId?: string;
    error: Error;
  };

  // Economy
  'economy:balanceUpdated': {
    userId: string;
    guildId: string;
    previousBalance: number;
    newBalance: number;
    reason: string;
  };

  // Music
  'music:trackStart': {
    guildId: string;
    trackTitle: string;
    requestedBy: string;
  };
  'music:queueEnd': {
    guildId: string;
  };
};

export type EventListener<T = unknown> = (payload: T) => void | Promise<void>;

export interface EventSubscription {
  unsubscribe: () => void;
}
