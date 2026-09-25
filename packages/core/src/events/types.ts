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
  /** A module's settings were changed outside this process (dashboard or CLI). */
  'guild:configChanged': {
    guildId: string;
    module: string;
    version: number;
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

  // Economy & Leveling
  'economy:balanceUpdated': {
    userId: string;
    guildId: string;
    previousBalance: number;
    newBalance: number;
    reason: string;
  };
  'leveling:levelUp': {
    userId: string;
    guildId: string;
    previousLevel: number;
    newLevel: number;
    levelsGained: number;
    totalXp: number;
    shouldNotify: boolean;
  };
  'economy:itemBought': {
    userId: string;
    itemId: string;
    quantity: number;
    totalPrice: number;
    guildId?: string | undefined;
  };
  'economy:itemUsed': {
    userId: string;
    itemId: string;
    quantity: number;
    effectType: string;
    guildId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
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

  // Moderation
  'moderation:actionExecuted': {
    guildId: string;
    action: string;
    targetUserId?: string | undefined;
    moderatorUserId: string;
    reason: string;
    caseNumber?: number | undefined;
    caseId?: string | undefined;
    durationSeconds?: number | null | undefined;
    metadata?: Record<string, unknown> | undefined;
  };
  'moderation:warningIssued': {
    guildId: string;
    userId: string;
    moderatorId: string;
    reason: string;
    severity: number;
    totalActiveWarnings: number;
  };
  'moderation:caseCreated': {
    guildId: string;
    caseNumber: number;
    type: string;
    targetUserId: string;
    moderatorUserId: string;
    reason: string;
    durationSeconds?: number | null | undefined;
  };
  'moderation:automodViolation': {
    guildId: string;
    channelId: string;
    userId: string;
    ruleType: string;
    action: string;
    reason: string;
    matchedContent?: string | undefined;
    messageId?: string | undefined;
  };
  'moderation:raidDetected': {
    guildId: string;
    joinCount: number;
    windowSeconds: number;
    actionTaken: string;
    accounts: Array<{ userId: string; accountAgeHours: number }>;
  };
};

export type EventListener<T = unknown> = (payload: T) => void | Promise<void>;

export interface EventSubscription {
  unsubscribe: () => void;
}
