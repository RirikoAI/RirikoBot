import { ErrorCode, ExternalApiError, RirikoError } from '@ririko/core';

export class AiProviderError extends ExternalApiError {
  public readonly providerId: string;
  public readonly isRetryable: boolean;
  public readonly externalStatusCode?: number | undefined;

  constructor(
    providerId: string,
    options: {
      message?: string;
      externalStatusCode?: number | undefined;
      isRetryable?: boolean | undefined;
      details?: unknown;
    } = {},
  ) {
    const errorOptions: { externalStatusCode?: number; details?: unknown } = {};
    if (options.externalStatusCode !== undefined) {
      errorOptions.externalStatusCode = options.externalStatusCode;
    }
    if (options.details !== undefined) {
      errorOptions.details = options.details;
    }

    super(
      providerId,
      options.message ?? `AI provider '${providerId}' failed to process request.`,
      errorOptions,
    );
    this.name = 'AiProviderError';
    this.providerId = providerId;
    this.externalStatusCode = options.externalStatusCode;
    this.isRetryable =
      options.isRetryable ??
      (options.externalStatusCode === 429 ||
        (options.externalStatusCode !== undefined && options.externalStatusCode >= 500));
  }
}

export class AiRateLimitError extends AiProviderError {
  public readonly retryAfterMs?: number | undefined;

  constructor(
    providerId: string,
    options: {
      message?: string | undefined;
      retryAfterMs?: number | undefined;
      details?: unknown;
    } = {},
  ) {
    super(providerId, {
      ...(options.message ? { message: options.message } : { message: `AI provider '${providerId}' rate limit or quota exceeded.` }),
      externalStatusCode: 429,
      isRetryable: true,
      ...(options.details !== undefined || options.retryAfterMs !== undefined
        ? { details: { ...((options.details as object) || {}), ...(options.retryAfterMs !== undefined ? { retryAfterMs: options.retryAfterMs } : {}) } }
        : {}),
    });
    this.name = 'AiRateLimitError';
    this.retryAfterMs = options.retryAfterMs;
  }
}

export interface ProviderFailureReport {
  providerId: string;
  error: Error;
  statusCode?: number | undefined;
}

export class AiProviderExhaustionError extends RirikoError {
  public readonly failures: readonly ProviderFailureReport[];

  constructor(failures: ProviderFailureReport[]) {
    const errorDetails = failures
      .map((f) => `[${f.providerId}]: ${f.error.message}`)
      .join('; ');

    super(`All configured AI providers in fallback chain failed: ${errorDetails}`, {
      code: ErrorCode.EXTERNAL_API_ERROR,
      statusCode: 503,
      userMessage: 'All AI services are temporarily unavailable. Please try again shortly.',
      details: {
        failures: failures.map((f) => ({
          providerId: f.providerId,
          message: f.error.message,
          ...(f.statusCode !== undefined ? { statusCode: f.statusCode } : {}),
        })),
      },
    });
    this.name = 'AiProviderExhaustionError';
    this.failures = Object.freeze([...failures]);
  }
}

export class AiToolExecutionError extends RirikoError {
  public readonly toolName: string;

  constructor(toolName: string, reason: string, details?: unknown) {
    super(`Tool '${toolName}' failed during execution: ${reason}`, {
      code: ErrorCode.BAD_REQUEST,
      statusCode: 400,
      userMessage: `Failed to execute tool '${toolName}': ${reason}`,
      ...(details !== undefined ? { details } : {}),
    });
    this.name = 'AiToolExecutionError';
    this.toolName = toolName;
  }
}
