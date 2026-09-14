import { ErrorCode } from './codes.js';

export interface RirikoErrorOptions {
  code?: ErrorCode | undefined;
  statusCode?: number | undefined;
  userMessage?: string | undefined;
  details?: unknown | undefined;
  cause?: Error | undefined;
  isOperational?: boolean | undefined;
}

/**
 * Base operational error class for all Ririko AI 2.0 subsystems.
 */
export class RirikoError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly userMessage: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(message: string, options: RirikoErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code ?? ErrorCode.INTERNAL_ERROR;
    this.statusCode = options.statusCode ?? 500;
    this.userMessage = options.userMessage ?? 'An unexpected error occurred. Please try again.';
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;

    // Maintain clean V8 stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      userMessage: this.userMessage,
      details: this.details,
      isOperational: this.isOperational,
    };
  }
}

/**
 * Thrown when user or command input fails validation constraints.
 */
export class ValidationError extends RirikoError {
  constructor(
    message: string,
    options: Omit<RirikoErrorOptions, 'code' | 'statusCode'> & { validationErrors?: string[] } = {},
  ) {
    super(message, {
      code: ErrorCode.VALIDATION_ERROR,
      statusCode: 400,
      userMessage: options.userMessage ?? message,
      details: options.validationErrors ?? options.details,
      ...options,
    });
  }
}

/**
 * Thrown when a requested resource (guild, user, card, item) is not found.
 */
export class NotFoundError extends RirikoError {
  constructor(
    resource: string,
    identifier?: string | number,
    options: Omit<RirikoErrorOptions, 'code' | 'statusCode'> = {},
  ) {
    const idInfo = identifier !== undefined ? ` with identifier '${identifier}'` : '';
    const message = `${resource}${idInfo} was not found.`;
    super(message, {
      code: ErrorCode.NOT_FOUND,
      statusCode: 404,
      userMessage: options.userMessage ?? message,
      details: { resource, identifier },
      ...options,
    });
  }
}

/**
 * Thrown when a user or caller lacks permissions to execute an action.
 */
export class PermissionDeniedError extends RirikoError {
  constructor(
    message: string = 'You do not have permission to perform this action.',
    options: Omit<RirikoErrorOptions, 'code' | 'statusCode'> & {
      requiredPermissions?: string[];
    } = {},
  ) {
    super(message, {
      code: ErrorCode.FORBIDDEN,
      statusCode: 403,
      userMessage: message,
      details: options.requiredPermissions
        ? { requiredPermissions: options.requiredPermissions }
        : options.details,
      ...options,
    });
  }
}

/**
 * Thrown when an action violates a cooldown or rate limit.
 */
export class RateLimitError extends RirikoError {
  public readonly retryAfterMs: number;

  constructor(
    retryAfterMs: number,
    message: string = `You are doing that too fast. Please wait ${(retryAfterMs / 1000).toFixed(1)}s.`,
    options: Omit<RirikoErrorOptions, 'code' | 'statusCode'> = {},
  ) {
    super(message, {
      code: ErrorCode.RATE_LIMITED,
      statusCode: 429,
      userMessage: message,
      details: { retryAfterMs },
      ...options,
    });
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Thrown when database operations or transactional commits fail.
 */
export class DatabaseError extends RirikoError {
  constructor(message: string, options: Omit<RirikoErrorOptions, 'code' | 'statusCode'> = {}) {
    super(message, {
      code: ErrorCode.DATABASE_ERROR,
      statusCode: 500,
      userMessage: 'A database error occurred. Please try again later.',
      ...options,
    });
  }
}

/**
 * Thrown when an external integration (Discord API, Twitch, OpenAI, Gemini) fails.
 */
export class ExternalApiError extends RirikoError {
  public readonly service: string;

  constructor(
    service: string,
    message: string,
    options: Omit<RirikoErrorOptions, 'code' | 'statusCode'> & {
      externalStatusCode?: number;
    } = {},
  ) {
    super(`External API [${service}] error: ${message}`, {
      code: ErrorCode.EXTERNAL_API_ERROR,
      statusCode: 502,
      userMessage: `Unable to connect to ${service}. Please try again later.`,
      details: { service, externalStatusCode: options.externalStatusCode },
      ...options,
    });
    this.service = service;
  }
}

/**
 * Thrown when business rules (e.g. economy transfer invariants, trading rules) are violated.
 */
export class BusinessLogicError extends RirikoError {
  constructor(
    message: string,
    options: Omit<RirikoErrorOptions, 'code' | 'statusCode'> & { code?: ErrorCode } = {},
  ) {
    super(message, {
      code: options.code ?? ErrorCode.BUSINESS_RULE_VIOLATION,
      statusCode: 422,
      userMessage: options.userMessage ?? message,
      ...options,
    });
  }
}
