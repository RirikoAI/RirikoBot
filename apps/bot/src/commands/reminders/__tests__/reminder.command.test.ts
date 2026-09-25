import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import type { CommandContext } from '@ririko/discord';
import type { Reminder } from '@ririko/database';
import type { BotServices } from '../../../services.js';
import { REMINDER_CANCEL_ID, createReminderCommand } from '../reminder.command.js';

/** Loose view of a reply payload built with discord.js builders. */
interface Payload {
  content?: string;
  ephemeral?: boolean;
  embeds: Array<{
    data: {
      title?: string;
      description?: string;
      fields: Array<{ value: string }>;
      footer: { text: string };
    };
  }>;
  components: Array<{ components: Array<{ data: { custom_id: string } }> }>;
}

const reminder = (id: string, overrides: Partial<Reminder> = {}): Reminder => ({
  id,
  userId: 'user-1',
  guildId: 'guild-1',
  channelId: 'channel-1',
  message: `note ${id}`,
  triggerAt: new Date('2026-09-23T01:00:00Z'),
  repeatInterval: 'NONE',
  isCompleted: false,
  ...overrides,
});

function setup(
  options: { source?: 'slash' | 'prefix'; args?: string[]; slash?: Record<string, string> } = {},
) {
  const reminderService = {
    create: vi.fn(async (input: { message?: string }) =>
      reminder('1a2b3c4d-0000-0000-0000-000000000000', {
        message: input.message ?? 'call mom',
        repeatInterval: 'DAILY',
      }),
    ),
    list: vi.fn(async () => [
      reminder('aaaa1111-x'),
      reminder('bbbb2222-x', { repeatInterval: 'WEEKLY' }),
    ]),
    cancel: vi.fn(async (_user: string, id: string) => reminder(id)),
  };
  const services = {
    reminderService,
    resolveUserTimeZone: vi.fn(async () => 'Asia/Kuala_Lumpur'),
    conversationManager: { setUserPreferences: vi.fn(async () => ({})) },
  } as unknown as BotServices;

  const collector = Object.assign(new EventEmitter(), { resetTimer: vi.fn() });
  const message = {
    createMessageComponentCollector: vi.fn(() => collector),
    edit: vi.fn(async () => undefined),
  };
  const slash = options.slash ?? {};
  const raw = {
    source: options.source ?? 'slash',
    commandName: 'reminder',
    user: { id: 'user-1' },
    guild: { id: 'guild-1' },
    channelId: 'channel-1',
    options: {
      getString: vi.fn((name: string) => slash[name] ?? null),
      getRawArgs: vi.fn(() => options.args ?? []),
    },
    reply: vi.fn(async (_payload: Payload) => undefined),
    deferReply: vi.fn(async (_options: unknown) => undefined),
    editReply: vi.fn(async (_payload: Payload) => message),
  };
  return {
    command: createReminderCommand(services),
    ctx: raw as unknown as CommandContext,
    raw,
    services: services as unknown as {
      reminderService: typeof reminderService;
      resolveUserTimeZone: ReturnType<typeof vi.fn>;
      conversationManager: { setUserPreferences: ReturnType<typeof vi.fn> };
    },
    collector,
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('/reminder (TASK-1413)', () => {
  it('sets a reminder from slash options in the user timezone and confirms with Discord timestamps', async () => {
    const { command, ctx, raw, services } = setup({
      slash: { time: 'tomorrow 9am', message: 'Stand-up', repeat: 'daily' },
    });

    await command.execute(ctx);

    expect(services.resolveUserTimeZone).toHaveBeenCalledWith('user-1', 'guild-1');
    expect(services.reminderService.create).toHaveBeenCalledWith({
      userId: 'user-1',
      guildId: 'guild-1',
      channelId: 'channel-1',
      when: 'tomorrow 9am',
      message: 'Stand-up',
      repeat: 'DAILY',
      timeZone: 'Asia/Kuala_Lumpur',
    });
    const reply = raw.reply.mock.calls[0]![0];
    expect(reply.ephemeral).toBe(true);
    const embed = reply.embeds[0]!.data;
    expect(embed.title).toBe('✅ Reminder set');
    expect(embed.fields[0]!.value).toBe('<t:1790125200:F>\n<t:1790125200:R>');
    expect(embed.fields.map((f) => f.value).slice(1)).toEqual(['Daily', '`1a2b3c4d`']);
    expect(embed.footer.text).toContain('Asia/Kuala_Lumpur');
  });

  it.each([
    [['1h', 'Take', 'a', 'break'], { when: '1h Take a break', repeat: undefined }],
    [
      ['call', 'mom', 'tomorrow', 'at', '6pm'],
      { when: 'call mom tomorrow at 6pm', repeat: undefined },
    ],
    [['daily', '9am', 'take', 'pills'], { when: '9am take pills', repeat: 'DAILY' }],
    [['set', 'weekly', 'friday', '8pm', 'raid'], { when: 'friday 8pm raid', repeat: 'WEEKLY' }],
  ])('parses the legacy prefix form %j', async (args, expected) => {
    const { command, ctx, services } = setup({ source: 'prefix', args });
    await command.execute(ctx);
    expect(services.reminderService.create).toHaveBeenCalledWith(
      expect.objectContaining({ ...expected, message: undefined }),
    );
  });

  it('lists reminders with timestamps and cancels from the menu for the owner only', async () => {
    const { command, ctx, raw, services, collector } = setup({ slash: { action: 'list' } });

    await command.execute(ctx);

    expect(raw.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const view = raw.editReply.mock.calls[0]![0];
    expect(view.embeds[0]!.data.title).toBe('⏰ Your reminders (2)');
    expect(view.embeds[0]!.data.description).toContain(
      '`aaaa1111` · <t:1790125200:f> (<t:1790125200:R>)',
    );
    expect(view.embeds[0]!.data.description).toContain('🔁 Weekly');
    expect(view.components[0]!.components[0]!.data.custom_id).toBe(REMINDER_CANCEL_ID);

    const intruder = {
      customId: REMINDER_CANCEL_ID,
      values: ['aaaa1111-x'],
      user: { id: 'user-2' },
      isStringSelectMenu: () => true,
      reply: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
    };
    collector.emit('collect', intruder);
    await flush();
    expect(services.reminderService.cancel).not.toHaveBeenCalled();

    const owner = {
      ...intruder,
      user: { id: 'user-1' },
      reply: vi.fn(),
      update: vi.fn(async () => undefined),
    };
    collector.emit('collect', owner);
    await flush();
    expect(services.reminderService.cancel).toHaveBeenCalledWith('user-1', 'aaaa1111-x');
    expect(owner.update).toHaveBeenCalled();
  });

  it('defaults to the list without a time and cancels by id from the prefix form', async () => {
    const empty = setup({ source: 'prefix', args: [] });
    await empty.command.execute(empty.ctx);
    expect(empty.services.reminderService.list).toHaveBeenCalled();

    const cancel = setup({ source: 'prefix', args: ['cancel', '1a2b3c4d'] });
    await cancel.command.execute(cancel.ctx);
    expect(cancel.services.reminderService.cancel).toHaveBeenCalledWith('user-1', '1a2b3c4d');
    expect(cancel.raw.reply.mock.calls[0]![0].content).toContain('Cancelled reminder');
  });

  it('shows, validates and saves the timezone', async () => {
    const show = setup({ slash: { action: 'timezone' } });
    await show.command.execute(show.ctx);
    expect(show.raw.reply.mock.calls[0]![0].content).toContain('**Asia/Kuala_Lumpur**');

    const bad = setup({ slash: { action: 'timezone', zone: 'GMT+8' } });
    await bad.command.execute(bad.ctx);
    expect(bad.services.conversationManager.setUserPreferences).not.toHaveBeenCalled();
    expect(bad.raw.reply.mock.calls[0]![0].content).toContain('not a timezone I know');

    const good = setup({ source: 'prefix', args: ['tz', 'europe/london'] });
    await good.command.execute(good.ctx);
    expect(good.services.conversationManager.setUserPreferences).toHaveBeenCalledWith('user-1', {
      timezone: 'Europe/London',
    });
  });
});
