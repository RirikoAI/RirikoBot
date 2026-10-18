import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type InteractionEditReplyOptions,
  type Message,
} from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { Reminder } from '@ririko/database';
import {
  REMINDER_LIMITS,
  canonicalTimeZone,
  shortReminderId,
  type ReminderRepeat,
} from '@ririko/services';
import type { BotServices } from '../../services.js';
import { attachOwnerCollector } from '../shared/owner-collector.js';

export const REMINDER_CANCEL_ID = 'reminder:cancel';
const COLOR = '#F5A623';
type ReminderAction = 'set' | 'list' | 'cancel' | 'timezone';

const REPEAT_LABEL: Record<string, string> = { NONE: 'No', DAILY: 'Daily', WEEKLY: 'Weekly' };

const unix = (date: Date) => Math.floor(date.getTime() / 1000);
const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

interface ParsedRequest {
  action: ReminderAction;
  when?: string | undefined;
  message?: string | undefined;
  repeat?: ReminderRepeat | undefined;
  id?: string | undefined;
  zone?: string | undefined;
}

/**
 * Prefix syntax (1.4.0 style):
 * `!remindme <time and message>`, `!remindme daily 9am take pills`,
 * `!reminder list`, `!reminder cancel <id>`, `!reminder timezone [zone]`.
 */
function parsePrefix(rawArgs: readonly string[]): ParsedRequest {
  const [first = '', ...rest] = rawArgs;
  const keyword = first.toLowerCase();
  if (keyword === 'list' || rawArgs.length === 0) return { action: 'list' };
  if (keyword === 'cancel' || keyword === 'delete') return { action: 'cancel', id: rest[0] };
  if (keyword === 'timezone' || keyword === 'tz')
    return { action: 'timezone', zone: rest.join(' ') || undefined };

  const words = keyword === 'set' ? rest : rawArgs;
  const repeatWord = words[0]?.toLowerCase();
  const repeat: ReminderRepeat | undefined =
    repeatWord === 'daily' ? 'DAILY' : repeatWord === 'weekly' ? 'WEEKLY' : undefined;
  return { action: 'set', when: (repeat ? words.slice(1) : words).join(' '), repeat };
}

function parseSlash(ctx: CommandContext): ParsedRequest {
  const when = ctx.options.getString('time') ?? undefined;
  const chosen = ctx.options.getString('action') as ReminderAction | null;
  const repeat = (ctx.options.getString('repeat')?.toUpperCase() ?? 'NONE') as ReminderRepeat;
  return {
    action: chosen ?? (when ? 'set' : 'list'),
    when,
    message: ctx.options.getString('message') ?? undefined,
    repeat,
    id: ctx.options.getString('id') ?? undefined,
    zone: ctx.options.getString('zone') ?? undefined,
  };
}

function buildListView(reminders: Reminder[]): InteractionEditReplyOptions {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`⏰ Your reminders (${reminders.length})`);
  if (reminders.length === 0) {
    embed.setDescription(
      'You have no active reminders.\nSet one with `/reminder time:tomorrow 9am message:Stand-up`.',
    );
    return { content: '', embeds: [embed], components: [] };
  }

  const lines = reminders.map((r) => {
    const repeat = r.repeatInterval !== 'NONE' ? ` · 🔁 ${REPEAT_LABEL[r.repeatInterval]}` : '';
    return `\`${shortReminderId(r.id)}\` · <t:${unix(r.triggerAt)}:f> (<t:${unix(r.triggerAt)}:R>)${repeat}\n${truncate(r.message, 150)}`;
  });
  embed
    .setDescription(truncate(lines.join('\n\n'), 4096))
    .setFooter({ text: 'Times are shown in your own timezone.' });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(REMINDER_CANCEL_ID)
    .setPlaceholder('Cancel a reminder')
    .addOptions(
      reminders.slice(0, 25).map((r) => ({
        label: truncate(r.message, 100),
        value: r.id,
        description: `${shortReminderId(r.id)} · ${r.triggerAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      })),
    );
  return {
    content: '',
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  };
}

function formatLocalTime(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(now);
}

export function createReminderCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'reminder',
      category: CommandCategory.UTILITY,
      description: 'Set, list, or cancel reminders, and set your timezone',
      aliases: ['remindme', 'reminders'],
      usage:
        '/reminder [time] [message] [repeat] | action:list | action:cancel id | action:timezone zone',
      examples: [
        '/reminder time:30m message:Check the oven',
        '/reminder time:tomorrow 9am message:Stand-up repeat:daily',
        '/reminder action:list',
        '/reminder action:timezone zone:Asia/Kuala_Lumpur',
        '!remindme 1h Take a break',
        '!remindme call mom tomorrow at 6pm',
        '!reminder cancel 1a2b3c4d',
      ],
      cooldownSeconds: 3,
      options: [
        {
          name: 'time',
          description: 'When: 30m, 2h, tomorrow 9am, next friday 8pm, 2026-12-25 08:00',
          type: 'STRING',
          required: false,
          maxLength: 100,
        },
        {
          name: 'message',
          description: 'What to remind you about',
          type: 'STRING',
          required: false,
          maxLength: REMINDER_LIMITS.maxMessageLength,
        },
        {
          name: 'repeat',
          description: 'Repeat the reminder',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'No', value: 'none' },
            { name: 'Daily', value: 'daily' },
            { name: 'Weekly', value: 'weekly' },
          ],
        },
        {
          name: 'action',
          description: 'What to do (default: set when a time is given, otherwise list)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Set a reminder', value: 'set' },
            { name: 'List my reminders', value: 'list' },
            { name: 'Cancel a reminder', value: 'cancel' },
            { name: 'Show or set my timezone', value: 'timezone' },
          ],
        },
        {
          name: 'id',
          description: 'Reminder id to cancel (from the list)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'zone',
          description:
            'Your IANA timezone, e.g. Asia/Kuala_Lumpur, Europe/London, America/New_York',
          type: 'STRING',
          required: false,
        },
      ],
    },

    execute: async (ctx: CommandContext) => {
      const request =
        ctx.source === 'prefix' ? parsePrefix(ctx.options.getRawArgs()) : parseSlash(ctx);
      const userId = ctx.user.id;
      const guildId = ctx.guild?.id ?? null;

      switch (request.action) {
        case 'set': {
          if (!request.when) {
            await ctx.reply({
              content: '❌ When should I remind you? For example `30m` or `tomorrow 9am`.',
              ephemeral: true,
            });
            return;
          }
          const timeZone = await services.resolveUserTimeZone(userId, guildId);
          const reminder = await services.reminderService.create({
            userId,
            guildId,
            channelId: ctx.channelId,
            when: request.when,
            message: request.message,
            repeat: request.repeat,
            timeZone,
          });
          const at = unix(reminder.triggerAt);
          const embed = new EmbedBuilder()
            .setColor(COLOR)
            .setTitle('✅ Reminder set')
            .setDescription(truncate(reminder.message, 4096))
            .addFields(
              { name: 'When', value: `<t:${at}:F>\n<t:${at}:R>`, inline: true },
              {
                name: 'Repeats',
                value: REPEAT_LABEL[reminder.repeatInterval] ?? 'No',
                inline: true,
              },
              { name: 'ID', value: `\`${shortReminderId(reminder.id)}\``, inline: true },
            )
            .setFooter({
              text: `Times read in ${timeZone}. Change it with /reminder action:timezone. I'll DM you, or ping you here if DMs are closed.`,
            });
          await ctx.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        case 'cancel': {
          if (!request.id) {
            await ctx.reply({
              content: '❌ Which reminder? Use the id shown in `/reminder action:list`.',
              ephemeral: true,
            });
            return;
          }
          const cancelled = await services.reminderService.cancel(userId, request.id);
          await ctx.reply({
            content: `🗑️ Cancelled reminder \`${shortReminderId(cancelled.id)}\`: ${truncate(cancelled.message, 200)}`,
            ephemeral: true,
          });
          return;
        }

        case 'timezone': {
          if (!request.zone) {
            const current = await services.resolveUserTimeZone(userId, guildId);
            await ctx.reply({
              content: `🕒 Your reminders use **${current}** (${formatLocalTime(current)}).\nChange it with \`/reminder action:timezone zone:Asia/Kuala_Lumpur\`.`,
              ephemeral: true,
            });
            return;
          }
          const zone = canonicalTimeZone(request.zone);
          if (!zone) {
            await ctx.reply({
              content: `❌ \`${truncate(request.zone, 60)}\` is not a timezone I know. Use an IANA name such as \`Asia/Kuala_Lumpur\`, \`Europe/London\` or \`America/New_York\`.`,
              ephemeral: true,
            });
            return;
          }
          await services.conversationManager.setUserPreferences(userId, { timezone: zone });
          await ctx.reply({
            content: `✅ Timezone set to **${zone}**. It is now ${formatLocalTime(zone)} there.`,
            ephemeral: true,
          });
          return;
        }

        case 'list': {
          await ctx.deferReply({ ephemeral: true });
          const message: Message = await ctx.editReply(
            buildListView(await services.reminderService.list(userId)),
          );
          attachOwnerCollector(message, {
            ownerId: userId,
            customIds: [REMINDER_CANCEL_ID],
            notOwnerHint: '⏳ Run `/reminder action:list` to see your own reminders.',
            onCollect: async (interaction) => {
              if (!interaction.isStringSelectMenu()) return;
              const id = interaction.values[0] ?? '';
              await services.reminderService.cancel(userId, id).catch(() => undefined);
              await interaction.update(buildListView(await services.reminderService.list(userId)));
            },
          });
          return;
        }
      }
    },
  };
}
