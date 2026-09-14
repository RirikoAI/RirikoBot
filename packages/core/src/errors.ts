/** An expected application failure safe to show to an end user. */
export class AppError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

/** Hide implementation errors and secret-bearing driver/provider messages. */
export function publicError(error: unknown): string {
  return error instanceof AppError ? error.message : 'The request could not be completed. Please try again.';
}
