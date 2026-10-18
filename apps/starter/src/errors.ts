/** A failure with a message for the reader and the exit code of the program. */
export class StarterError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'StarterError';
    this.exitCode = exitCode;
  }
}
