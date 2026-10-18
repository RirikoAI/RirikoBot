import { RirikoError, type RirikoErrorOptions, ErrorCode } from '@ririko/core';

/**
 * Base error class for Discord subsystem errors.
 */
export class DiscordError extends RirikoError {
  constructor(message: string, options: RirikoErrorOptions = {}) {
    super(message, {
      code: options.code ?? ErrorCode.INTERNAL_ERROR,
      statusCode: options.statusCode ?? 500,
      userMessage: options.userMessage ?? 'A Discord subsystem error occurred.',
      ...options,
    });
  }
}

/**
 * Error raised during Gateway connection, lifecycle, or heartbeat issues.
 */
export class GatewayError extends DiscordError {
  constructor(message: string, options: RirikoErrorOptions = {}) {
    super(message, {
      code: options.code ?? ErrorCode.NETWORK_TIMEOUT,
      statusCode: options.statusCode ?? 503,
      userMessage: options.userMessage ?? 'Discord gateway connection error.',
      ...options,
    });
  }
}

/**
 * Error raised during command execution or validation.
 */
export class CommandError extends DiscordError {
  constructor(message: string, options: RirikoErrorOptions = {}) {
    super(message, {
      code: options.code ?? ErrorCode.BAD_REQUEST,
      statusCode: options.statusCode ?? 400,
      userMessage: options.userMessage ?? 'Command execution failed.',
      ...options,
    });
  }
}

/**
 * Error raised when user or bot lacks required permissions to run a command.
 */
export class CommandPermissionError extends CommandError {
  public readonly missingPermissions: readonly string[];
  public readonly missingFor: 'user' | 'bot';

  constructor(
    message: string,
    options: RirikoErrorOptions & {
      missingPermissions?: string[];
      missingFor?: 'user' | 'bot';
    } = {},
  ) {
    super(message, {
      code: options.code ?? ErrorCode.INSUFFICIENT_PERMISSIONS,
      statusCode: options.statusCode ?? 403,
      userMessage: options.userMessage ?? message,
      details: {
        missingPermissions: options.missingPermissions ?? [],
        missingFor: options.missingFor ?? 'user',
        ...(typeof options.details === 'object' && options.details !== null ? options.details : {}),
      },
      ...options,
    });
    this.missingPermissions = options.missingPermissions ?? [];
    this.missingFor = options.missingFor ?? 'user';
  }
}

/**
 * Error raised when a user is on command cooldown.
 */
export class CommandCooldownError extends CommandError {
  public readonly retryAfterSeconds: number;

  constructor(
    message: string,
    options: RirikoErrorOptions & { retryAfterSeconds: number } = { retryAfterSeconds: 0 },
  ) {
    super(message, {
      code: options.code ?? ErrorCode.COOLDOWN_ACTIVE,
      statusCode: options.statusCode ?? 429,
      userMessage: options.userMessage ?? message,
      details: {
        retryAfterSeconds: options.retryAfterSeconds,
        ...(typeof options.details === 'object' && options.details !== null ? options.details : {}),
      },
      ...options,
    });
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/**
 * Error raised when command rate limit is exceeded.
 */
export class CommandRateLimitError extends CommandError {
  public readonly retryAfterSeconds: number;

  constructor(
    message: string,
    options: RirikoErrorOptions & { retryAfterSeconds: number } = { retryAfterSeconds: 0 },
  ) {
    super(message, {
      code: options.code ?? ErrorCode.RATE_LIMITED,
      statusCode: options.statusCode ?? 429,
      userMessage: options.userMessage ?? message,
      details: {
        retryAfterSeconds: options.retryAfterSeconds,
        ...(typeof options.details === 'object' && options.details !== null ? options.details : {}),
      },
      ...options,
    });
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/**
 * Error raised when the bot or module is in maintenance mode.
 */
export class CommandMaintenanceError extends CommandError {
  constructor(
    message: string = 'Ririko is currently undergoing scheduled maintenance.',
    options: RirikoErrorOptions = {},
  ) {
    super(message, {
      code: options.code ?? ErrorCode.FORBIDDEN,
      statusCode: options.statusCode ?? 503,
      userMessage: options.userMessage ?? message,
      ...options,
    });
  }
}

/**
 * Error raised when a guild-only command is executed outside a guild.
 */
export class CommandGuildOnlyError extends CommandError {
  constructor(
    message: string = 'This command can only be used within a server.',
    options: RirikoErrorOptions = {},
  ) {
    super(message, {
      code: options.code ?? ErrorCode.BAD_REQUEST,
      statusCode: options.statusCode ?? 400,
      userMessage: options.userMessage ?? message,
      ...options,
    });
  }
}

/**
 * Error raised when a module or command is disabled in a guild.
 */
export class CommandDisabledError extends CommandError {
  constructor(message: string, options: RirikoErrorOptions = {}) {
    super(message, {
      code: options.code ?? ErrorCode.FORBIDDEN,
      statusCode: options.statusCode ?? 403,
      userMessage: options.userMessage ?? message,
      ...options,
    });
  }
}
