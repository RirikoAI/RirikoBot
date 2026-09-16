import { z } from 'zod';
import type { SafeTool, ReminderCreateResult, ToolExecutionContext } from '../types.js';

export const ReminderCreateArgsSchema = z.object({
  timeString: z.string().min(1, 'Time duration must not be empty'),
  message: z.string().min(1, 'Reminder message must not be empty').max(500),
});

export type ReminderCreateArgs = z.infer<typeof ReminderCreateArgsSchema>;

export class ReminderTool implements SafeTool<ReminderCreateArgs, ReminderCreateResult> {
  readonly definition = {
    name: 'reminders.create',
    description: 'Schedules a personal reminder for the user after a given time duration (e.g. "10m", "2h", "30 minutes", "1 day").',
    parameters: {
      type: 'object',
      properties: {
        timeString: {
          type: 'string',
          description: 'Duration string specifying when to send the reminder (e.g. "10m", "2 hours", "1d", "45s").',
        },
        message: {
          type: 'string',
          description: 'The reminder message or note to be delivered.',
        },
      },
      required: ['timeString', 'message'],
    },
  };

  readonly schema = ReminderCreateArgsSchema;
  readonly moduleName = 'utilities';

  /**
   * Parses basic human durations into milliseconds.
   */
  parseDuration(input: string): { ms: number; description: string } {
    const text = input.trim().toLowerCase();

    // Regex for numbers + unit
    const match = text.match(/^(\d+(?:\.\d+)?)\s*(s(?:ec(?:ond)?s?)?|m(?:in(?:ute)?s?)?|h(?:(?:ou)?rs?)?|d(?:ays?)?)$/);
    if (match && match[1] && match[2]) {
      const value = parseFloat(match[1]);
      const unit = match[2][0];

      switch (unit) {
        case 's':
          return { ms: value * 1000, description: `${value} second${value === 1 ? '' : 's'}` };
        case 'm':
          return { ms: value * 60 * 1000, description: `${value} minute${value === 1 ? '' : 's'}` };
        case 'h':
          return { ms: value * 3600 * 1000, description: `${value} hour${value === 1 ? '' : 's'}` };
        case 'd':
          return { ms: value * 86400 * 1000, description: `${value} day${value === 1 ? '' : 's'}` };
      }
    }

    // Default fallback: 10 minutes
    return { ms: 10 * 60 * 1000, description: '10 minutes' };
  }

  async execute(args: ReminderCreateArgs, _context: ToolExecutionContext): Promise<ReminderCreateResult> {
    const { ms, description } = this.parseDuration(args.timeString);
    const triggerTime = new Date(Date.now() + ms);

    return {
      scheduled: true,
      message: args.message,
      triggerTimeIso: triggerTime.toISOString(),
      relativeDescription: `in ${description}`,
    };
  }
}
