import { pino, type Logger, type DestinationStream } from 'pino';

/** Structured logger with credential redaction; callers must not log raw messages/errors. */
export function createLogger(level = 'info', destination?: DestinationStream): Logger {
  const options = {
    level,
    base: { service: 'ririko', version: '2.0.0' },
    redact: {
      paths: ['token', 'password', 'secret', 'apiKey', 'authorization', 'DATABASE_URL', 'DISCORD_TOKEN', '*.token', '*.password', '*.secret', '*.apiKey', '*.authorization', 'req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
