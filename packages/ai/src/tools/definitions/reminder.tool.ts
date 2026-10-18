import { z } from 'zod';
import type { SafeTool, ReminderCreateResult, ToolExecutionContext } from '../types.js';

export const ReminderCreateArgsSchema = z.object({
  timeString: z.string().min(1, 'Time duration must not be empty'),
  message: z.string().min(1, 'Reminder message must not be empty').max(500),
});

export type ReminderCreateArgs = z.infer<typeof ReminderCreateArgsSchema>;

/**
 * Injected by the host app (the bot wires `ReminderService` from @ririko/services). Resolves the
 * stored reminder, or throws with a user-facing reason (invalid time, limit reached, ...).
 */
export type ReminderToolScheduler = (
  args: ReminderCreateArgs,
  context: ToolExecutionContext,
) => Promise<{ message: string; triggerAt: Date }>;

export class ReminderTool implements SafeTool<ReminderCreateArgs, ReminderCreateResult> {
  readonly definition = {
    name: 'reminders.create',
    description:
      'Schedules a personal reminder for the user. Accepts relative or natural times (e.g. "10m", "2 hours", "tomorrow 9am", "next friday at 8pm") in the user timezone.',
    parameters: {
      type: 'object',
      properties: {
        timeString: {
          type: 'string',
          description:
            'When to remind, e.g. "10m", "2 hours", "tomorrow 9am", "next friday at 8pm".',
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

  private readonly scheduler?: ReminderToolScheduler | undefined;

  constructor(scheduler?: ReminderToolScheduler) {
    this.scheduler = scheduler;
  }

  async execute(
    args: ReminderCreateArgs,
    context: ToolExecutionContext,
  ): Promise<ReminderCreateResult> {
    if (!this.scheduler) {
      return this.failed(args, 'Reminders are not available right now.');
    }
    try {
      const { message, triggerAt } = await this.scheduler(args, context);
      const unix = Math.floor(triggerAt.getTime() / 1000);
      return {
        scheduled: true,
        message,
        triggerTimeIso: triggerAt.toISOString(),
        // Discord renders this in each reader's own timezone.
        relativeDescription: `<t:${unix}:R>, <t:${unix}:f>`,
      };
    } catch (err) {
      const reason =
        err &&
        typeof err === 'object' &&
        'userMessage' in err &&
        typeof err.userMessage === 'string'
          ? err.userMessage
          : 'The reminder could not be saved.';
      return this.failed(args, reason);
    }
  }

  private failed(args: ReminderCreateArgs, reason: string): ReminderCreateResult {
    return {
      scheduled: false,
      message: args.message,
      triggerTimeIso: '',
      relativeDescription: '',
      error: reason,
    };
  }
}
