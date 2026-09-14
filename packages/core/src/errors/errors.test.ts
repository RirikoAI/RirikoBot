import { describe, expect, it } from 'vitest';
import {
  BusinessLogicError,
  DatabaseError,
  ErrorCode,
  ExternalApiError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  RirikoError,
  ValidationError,
} from './index.js';

describe('Error Hierarchy', () => {
  it('creates base RirikoError with sensible defaults', () => {
    const error = new RirikoError('Something went wrong');

    expect(error.name).toBe('RirikoError');
    expect(error.message).toBe('Something went wrong');
    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(true);
    expect(error.userMessage).toBe('An unexpected error occurred. Please try again.');

    const json = error.toJSON();
    expect(json).toMatchObject({
      name: 'RirikoError',
      message: 'Something went wrong',
      code: ErrorCode.INTERNAL_ERROR,
      statusCode: 500,
      isOperational: true,
    });
  });

  it('creates ValidationError with 400 status and details', () => {
    const error = new ValidationError('Invalid card level', {
      validationErrors: ['level must be between 1 and 100'],
    });

    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual(['level must be between 1 and 100']);
  });

  it('creates NotFoundError with 404 and resource details', () => {
    const error = new NotFoundError('WaifuCard', 'card-1234');

    expect(error.name).toBe('NotFoundError');
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("WaifuCard with identifier 'card-1234' was not found.");
    expect(error.details).toEqual({ resource: 'WaifuCard', identifier: 'card-1234' });
  });

  it('creates PermissionDeniedError with 403 status', () => {
    const error = new PermissionDeniedError('Missing permissions', {
      requiredPermissions: ['Administrator'],
    });

    expect(error.name).toBe('PermissionDeniedError');
    expect(error.code).toBe(ErrorCode.FORBIDDEN);
    expect(error.statusCode).toBe(403);
    expect(error.details).toEqual({ requiredPermissions: ['Administrator'] });
  });

  it('creates RateLimitError with 429 and retryAfterMs', () => {
    const error = new RateLimitError(5000);

    expect(error.name).toBe('RateLimitError');
    expect(error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(error.statusCode).toBe(429);
    expect(error.retryAfterMs).toBe(5000);
    expect(error.userMessage).toContain('5.0s');
  });

  it('creates DatabaseError with 500 status', () => {
    const error = new DatabaseError('Connection timeout');

    expect(error.name).toBe('DatabaseError');
    expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
    expect(error.statusCode).toBe(500);
  });

  it('creates ExternalApiError with 502 and service name', () => {
    const error = new ExternalApiError('Twitch', 'Bad gateway', { externalStatusCode: 502 });

    expect(error.name).toBe('ExternalApiError');
    expect(error.code).toBe(ErrorCode.EXTERNAL_API_ERROR);
    expect(error.statusCode).toBe(502);
    expect(error.service).toBe('Twitch');
    expect(error.details).toEqual({ service: 'Twitch', externalStatusCode: 502 });
  });

  it('creates BusinessLogicError with 422 status', () => {
    const error = new BusinessLogicError('Insufficient gems for gacha pull', {
      code: ErrorCode.INSUFFICIENT_FUNDS,
    });

    expect(error.name).toBe('BusinessLogicError');
    expect(error.code).toBe(ErrorCode.INSUFFICIENT_FUNDS);
    expect(error.statusCode).toBe(422);
  });
});
