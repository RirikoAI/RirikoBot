import { z } from 'zod';
import type { SafeTool, TimeToolResult, ToolExecutionContext } from '../types.js';

export const TimeToolArgsSchema = z.object({
  timezone: z.string().optional(),
});

export type TimeToolArgs = z.infer<typeof TimeToolArgsSchema>;

export class TimeTool implements SafeTool<TimeToolArgs, TimeToolResult> {
  readonly definition = {
    name: 'get_current_time',
    description:
      'Retrieves the accurate current wall-clock date and time in the user or server timezone.',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description:
            'Optional IANA timezone name (e.g. "America/New_York", "Asia/Tokyo", "Europe/London"). If omitted, resolves user or server preferences automatically.',
        },
      },
    },
  };

  readonly schema = TimeToolArgsSchema;

  /**
   * Resolves target timezone by priority:
   * 1. Explicit argument
   * 2. User preference
   * 3. Guild preference
   * 4. UTC
   */
  resolveTimezone(args: TimeToolArgs, context: ToolExecutionContext): string {
    const candidates = [args.timezone, context.userTimezone, context.guildTimezone, 'UTC'];

    for (const tz of candidates) {
      if (tz && this.isValidTimezone(tz)) {
        return tz;
      }
    }

    return 'UTC';
  }

  private isValidTimezone(tz: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  async execute(args: TimeToolArgs, context: ToolExecutionContext): Promise<TimeToolResult> {
    const tz = this.resolveTimezone(args, context);
    const now = new Date();

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });

    const offsetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    });

    const parts = offsetFormatter.formatToParts(now);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    const utcOffset = tzPart?.value ?? 'UTC';

    return {
      iso: now.toISOString(),
      formatted: formatter.format(now),
      timezone: tz,
      utcOffset,
    };
  }
}
