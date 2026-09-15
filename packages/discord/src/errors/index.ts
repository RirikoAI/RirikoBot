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
