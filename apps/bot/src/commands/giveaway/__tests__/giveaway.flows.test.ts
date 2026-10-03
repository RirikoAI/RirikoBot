import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { createGiveawayCommands } from '../giveaway.command.js';
import type { BotServices } from '../../../services.js';

const NOW = new Date('2026-10-03T12:00:00.000Z');

const activeGiveaway = {
  id: 'gw-1',
  guildId: 'guild-1',
  channelId: 'channel-gw',
  messageId: 'msg-1',
  prize: 'Nitro',
  winnerCount: 1,
  startsAt: new Date('2026-10-03T10:00:00.000Z'),
  endsAt: new Date('2026-10-04T10:00:00.000Z'),
  isEnded: false,
  requirements: {},
  createdBy: 'host',
};

describe('giveaway command flows (TASK-1254)', () => {
  let services: any;
  let commands: ReturnType<typeof createGiveawayCommands>;
  let channelSend: ReturnType<typeof vi.fn>;
  let hostedMessage: { delete: ReturnType<typeof vi.fn>; edit: ReturnType<typeof vi.fn> };

  const command = (name: string) => commands.find((c) => c.metadata.name === name)!;

  function makeCtx(opts: {
    action?: string;
    strings?: Record<string, string>;
    integers?: Record<string, number>;
    raw?: string[];
    channel?: unknown;
    guildId?: string | null;
    member?: unknown;
    role?: { id: string } | null;
    source?: string;
    fetchChannel?: unknown;
  }) {
    const reply = vi.fn().mockResolvedValue(undefined);
    const strings = { ...(opts.action ? { action: opts.action } : {}), ...opts.strings };
    const ctx: any = {
      guildId: opts.guildId === undefined ? 'guild-1' : opts.guildId,
      user: { id: 'host' },
      member: opts.member ?? null,
      channel: opts.channel ?? { id: 'channel-here', send: channelSend },
      source: opts.source ?? 'prefix',
      raw: { options: { getRole: () => opts.role ?? null } },
      client: {
        channels: {
          fetch: vi.fn().mockResolvedValue(
            opts.fetchChannel === undefined
              ? {
                  isSendable: () => true,
                  isTextBased: () => true,
                  send: channelSend,
                  messages: { fetch: vi.fn().mockResolvedValue(hostedMessage) },
                }
              : opts.fetchChannel,
          ),
        },
      },
      options: {
        getString: vi.fn((k: string) => (strings as Record<string, string>)[k] ?? null),
        getInteger: vi.fn((k: string) => opts.integers?.[k] ?? null),
        getChannel: vi.fn().mockResolvedValue(null),
        getRawArgs: vi.fn().mockReturnValue(opts.raw ?? []),
      },
      reply,
    };
    return { ctx, reply };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    channelSend = vi.fn().mockResolvedValue({ id: 'sent-1', url: 'https://discord/msg/sent-1' });
    hostedMessage = {
      delete: vi.fn().mockResolvedValue(undefined),
      edit: vi.fn().mockResolvedValue(undefined),
    };
    services = {
      giveawayRepo: {
        findById: vi.fn(async (id: string) => (id === 'gw-1' ? { ...activeGiveaway } : null)),
        findByMessageId: vi.fn(async (id: string) =>
          id === 'msg-1' ? { ...activeGiveaway } : null,
        ),
        update: vi.fn(async (_id: string, data: object) => ({ ...activeGiveaway, ...data })),
        delete: vi.fn().mockResolvedValue(true),
        listActiveGiveaways: vi.fn().mockResolvedValue([]),
        getEntryCount: vi.fn().mockResolvedValue(3),
      },
      giveawayEngine: {
        createGiveaway: vi.fn(async (input: any) => ({
          ...activeGiveaway,
          ...input,
          id: 'gw-new',
        })),
        rollAndEndGiveaway: vi
          .fn()
          .mockResolvedValue({
            giveaway: activeGiveaway,
            winnerIds: ['w1', 'w2'],
            isReroll: false,
          }),
        reroll: vi
          .fn()
          .mockResolvedValue({ giveaway: activeGiveaway, winnerIds: ['w3'], isReroll: true }),
        formatGiveawayEmbed: vi.fn().mockReturnValue({ title: 'GIVEAWAY', description: 'enter' }),
        formatGiveawayButton: vi.fn().mockReturnValue({
          customId: 'giveaway:enter:gw-new',
          label: 'Enter',
          style: 1,
          emoji: { name: '🎉' },
        }),
      },
    };
    commands = createGiveawayCommands(services as BotServices);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('dispatch and permissions', () => {
    it('refuses to run outside a server', async () => {
      const { ctx, reply } = makeCtx({ guildId: null, action: 'list' });
      await command('giveaway').execute(ctx);
      expect(reply).toHaveBeenCalledWith({
        content: '❌ Giveaway commands can only be used within a server.',
      });
    });

    it('lets anyone list but needs Manage Messages, Manage Server or Administrator for the rest', async () => {
      const member = (granted: bigint | null) => ({
        permissions: { has: (flag: bigint) => flag === granted },
      });
      const denied = makeCtx({ action: 'end', member: member(null) });
      await command('giveaway').execute(denied.ctx);
      expect(denied.reply.mock.calls[0]![0].content).toContain('Manage Messages');
      expect(services.giveawayEngine.rollAndEndGiveaway).not.toHaveBeenCalled();

      for (const flag of [
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.Administrator,
      ]) {
        const allowed = makeCtx({
          action: 'end',
          strings: { giveaway: 'gw-1' },
          member: member(flag),
        });
        await command('giveaway').execute(allowed.ctx);
        expect(allowed.reply.mock.calls[0]![0].content).toContain('ended!');
      }

      const list = makeCtx({ action: 'list', member: member(null) });
      await command('giveaway').execute(list.ctx);
      expect(list.reply.mock.calls[0]![0].content).toContain('no active giveaways');
    });

    it('takes the action from the first prefix argument and defaults to listing', async () => {
      const end = makeCtx({ raw: ['end', 'gw-1'] });
      await command('giveaway').execute(end.ctx);
      expect(end.reply.mock.calls[0]![0].content).toContain('ended!');

      const fallback = makeCtx({ raw: ['whatever'] });
      await command('giveaway').execute(fallback.ctx);
      expect(fallback.reply.mock.calls[0]![0].content).toContain('no active giveaways');
    });

    it('rejects an unknown action', async () => {
      const { ctx, reply } = makeCtx({ action: 'explode' });
      await command('giveaway').execute(ctx);
      expect(reply).toHaveBeenCalledWith({ content: '❌ Unknown giveaway action: `explode`.' });
    });

    it('legacy aliases run the matching action', async () => {
      const gend = makeCtx({ raw: ['gw-1'] });
      await command('gend').execute(gend.ctx);
      expect(services.giveawayEngine.rollAndEndGiveaway).toHaveBeenCalledWith('gw-1');

      services.giveawayRepo.listActiveGiveaways.mockResolvedValue([activeGiveaway]);
      const glist = makeCtx({});
      await command('glist').execute(glist.ctx);
      expect(glist.reply.mock.calls[0]![0].embeds[0].data.title).toBe('🎉 Active Giveaways');
    });
  });

  describe('create', () => {
    it('asks for a prize, a duration and a sane length', async () => {
      let made = makeCtx({ action: 'create' });
      await command('giveaway').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('what prize');

      made = makeCtx({ action: 'create', strings: { prize: 'Nitro' } });
      await command('giveaway').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('valid duration');

      for (const duration of ['2s', 'soon']) {
        made = makeCtx({ action: 'create', strings: { prize: 'Nitro', duration } });
        await command('giveaway').execute(made.ctx);
        expect(made.reply.mock.calls[0]![0].content).toContain('at least 5 seconds');
      }

      made = makeCtx({ action: 'create', strings: { prize: 'Nitro', duration: '31d' } });
      await command('giveaway').execute(made.ctx);
      expect(made.reply).toHaveBeenCalledWith({
        content: '❌ Giveaway duration cannot exceed 30 days.',
      });
      expect(services.giveawayEngine.createGiveaway).not.toHaveBeenCalled();
    });

    it('needs a channel the bot can send to', async () => {
      const { ctx, reply } = makeCtx({
        action: 'create',
        strings: { prize: 'Nitro', duration: '1h' },
        channel: { id: 'voice-1' },
      });
      await command('giveaway').execute(ctx);
      expect(reply).toHaveBeenCalledWith({
        content: '❌ Could not resolve a valid text channel for the giveaway.',
      });
    });

    it('creates the giveaway, posts it with an enter button and stores the message id', async () => {
      const { ctx, reply } = makeCtx({
        action: 'create',
        strings: { prize: 'Nitro', duration: '2h' },
        integers: { winners: 3 },
      });
      await command('giveaway').execute(ctx);

      expect(services.giveawayEngine.createGiveaway).toHaveBeenCalledWith({
        guildId: 'guild-1',
        channelId: 'channel-here',
        prize: 'Nitro',
        winnerCount: 3,
        durationMs: 2 * 3_600_000,
        createdBy: 'host',
        requirements: {},
      });
      const posted = channelSend.mock.calls[0]![0];
      expect(posted.components[0].components[0].data.custom_id).toBe('giveaway:enter:gw-new');
      expect(services.giveawayRepo.update).toHaveBeenCalledWith('gw-new', { messageId: 'sent-1' });
      expect(reply).toHaveBeenCalledWith({
        content:
          '🎉 Giveaway created successfully in <#channel-here>!\n[Jump to Giveaway](https://discord/msg/sent-1)',
      });
    });

    it('records the role requirement from a slash command', async () => {
      const { ctx } = makeCtx({
        action: 'create',
        source: 'slash',
        strings: { prize: 'Nitro', duration: '1h' },
        role: { id: 'role-9' },
      });
      await command('giveaway').execute(ctx);
      expect(services.giveawayEngine.createGiveaway).toHaveBeenCalledWith(
        expect.objectContaining({ requirements: { requiredRoleIds: ['role-9'] } }),
      );
    });

    it.each([
      [['create', '30m', '2', 'Steam', 'Key'], 30 * 60_000, 2, 'Steam Key'],
      [['create', '30m', 'Steam', 'Key'], 30 * 60_000, 1, 'Steam Key'],
      [['create', 'Mystery', 'Prize'], undefined, 1, 'Mystery Prize'],
    ])(
      'parses prefix arguments %j',
      async (raw, expectedDuration, expectedWinners, expectedPrize) => {
        const { ctx, reply } = makeCtx({ raw: raw as string[] });
        await command('giveaway').execute(ctx);
        if (expectedDuration === undefined) {
          expect(reply.mock.calls[0]![0].content).toContain('valid duration');
          return;
        }
        expect(services.giveawayEngine.createGiveaway).toHaveBeenCalledWith(
          expect.objectContaining({
            durationMs: expectedDuration,
            winnerCount: expectedWinners,
            prize: expectedPrize,
          }),
        );
      },
    );
  });

  describe('end', () => {
    it('needs an id and an existing giveaway from this server', async () => {
      let made = makeCtx({ action: 'end' });
      await command('giveaway').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('provide the Message ID');

      made = makeCtx({ action: 'end', strings: { giveaway: 'nope' } });
      await command('giveaway').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('No active giveaway found');

      made = makeCtx({ action: 'end', strings: { giveaway: 'gw-1' }, guildId: 'other-guild' });
      await command('giveaway').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('No active giveaway found');
    });

    it('resolves a giveaway by message id', async () => {
      const { ctx, reply } = makeCtx({ action: 'end', strings: { giveaway: 'msg-1' } });
      await command('giveaway').execute(ctx);
      expect(services.giveawayEngine.rollAndEndGiveaway).toHaveBeenCalledWith('gw-1');
      expect(reply.mock.calls[0]![0].content).toContain('<@w1>, <@w2>');
    });

    it('says when the giveaway already ended, before or during the roll', async () => {
      services.giveawayRepo.findById.mockResolvedValue({ ...activeGiveaway, isEnded: true });
      let made = makeCtx({ action: 'end', strings: { giveaway: 'gw-1' } });
      await command('giveaway').execute(made.ctx);
      expect(made.reply).toHaveBeenCalledWith({ content: '⚠️ This giveaway has already ended.' });

      services.giveawayRepo.findById.mockResolvedValue({ ...activeGiveaway });
      services.giveawayEngine.rollAndEndGiveaway.mockResolvedValue(null);
      made = makeCtx({ action: 'end', strings: { giveaway: 'gw-1' } });
      await command('giveaway').execute(made.ctx);
      expect(made.reply).toHaveBeenCalledWith({ content: '⚠️ This giveaway has already ended.' });
    });

    it('reports no winners when nobody entered', async () => {
      services.giveawayEngine.rollAndEndGiveaway.mockResolvedValue({
        giveaway: activeGiveaway,
        winnerIds: [],
        isReroll: false,
      });
      const { ctx, reply } = makeCtx({ action: 'end', strings: { giveaway: 'gw-1' } });
      await command('giveaway').execute(ctx);
      expect(reply.mock.calls[0]![0].content).toContain('None (No eligible entries)');
    });
  });

  describe('reroll', () => {
    const ended = { ...activeGiveaway, isEnded: true };

    it('needs an id, an existing giveaway and an ended one', async () => {
      let made = makeCtx({ action: 'reroll' });
      await command('giveaway').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('to reroll');

      made = makeCtx({ action: 'reroll', strings: { giveaway: 'nope' } });
      await command('giveaway').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('No giveaway found');

      made = makeCtx({ action: 'reroll', strings: { giveaway: 'gw-1' } });
      await command('giveaway').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('still active');
      expect(services.giveawayEngine.reroll).not.toHaveBeenCalled();
    });

    it('announces the new winners in the host channel without pinging anyone else', async () => {
      services.giveawayRepo.findById.mockResolvedValue(ended);
      const { ctx, reply } = makeCtx({
        action: 'reroll',
        strings: { giveaway: 'gw-1' },
        integers: { winners: 2 },
      });
      await command('giveaway').execute(ctx);

      expect(services.giveawayEngine.reroll).toHaveBeenCalledWith('gw-1', 2);
      expect(ctx.client.channels.fetch).toHaveBeenCalledWith('channel-gw');
      const sent = channelSend.mock.calls[0]![0];
      expect(sent.content).toContain('<@w3>');
      expect(sent.allowedMentions).toEqual({ parse: [], users: ['w3'] });
      expect(reply).toHaveBeenCalledWith({
        content: '🎉 Reroll complete! New winner(s): <@w3>',
      });
    });

    it('takes the winner count from the prefix arguments', async () => {
      services.giveawayRepo.findById.mockResolvedValue(ended);
      const { ctx } = makeCtx({ raw: ['reroll', 'gw-1', '4'] });
      await command('giveaway').execute(ctx);
      expect(services.giveawayEngine.reroll).toHaveBeenCalledWith('gw-1', 4);
    });

    it('says when no new winner can be chosen', async () => {
      services.giveawayRepo.findById.mockResolvedValue(ended);
      services.giveawayEngine.reroll.mockResolvedValue({
        giveaway: ended,
        winnerIds: [],
        isReroll: true,
      });
      const { ctx, reply } = makeCtx({ action: 'reroll', strings: { giveaway: 'gw-1' } });
      await command('giveaway').execute(ctx);
      expect(reply.mock.calls[0]![0].content).toContain('No new eligible winners');
    });

    it('still confirms the reroll when the announcement cannot be posted', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      services.giveawayRepo.findById.mockResolvedValue(ended);
      channelSend.mockRejectedValue(new Error('missing access'));
      const { ctx, reply } = makeCtx({ action: 'reroll', strings: { giveaway: 'gw-1' } });
      await command('giveaway').execute(ctx);
      expect(error).toHaveBeenCalled();
      expect(reply.mock.calls[0]![0].content).toContain('Reroll complete');

      const gone = makeCtx({
        action: 'reroll',
        strings: { giveaway: 'gw-1' },
        fetchChannel: null,
      });
      await command('giveaway').execute(gone.ctx);
      expect(gone.reply.mock.calls[0]![0].content).toContain('Reroll complete');
    });
  });

  describe('delete', () => {
    it('needs an id and an existing giveaway', async () => {
      let made = makeCtx({ action: 'delete' });
      await command('giveaway').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('to delete');
      made = makeCtx({ action: 'delete', strings: { giveaway: 'nope' } });
      await command('giveaway').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('No giveaway found');
      expect(services.giveawayRepo.delete).not.toHaveBeenCalled();
    });

    it('removes the Discord message and the record', async () => {
      const { ctx, reply } = makeCtx({ action: 'delete', strings: { giveaway: 'gw-1' } });
      await command('giveaway').execute(ctx);
      expect(hostedMessage.delete).toHaveBeenCalled();
      expect(services.giveawayRepo.delete).toHaveBeenCalledWith('gw-1');
      expect(reply).toHaveBeenCalledWith({
        content: '🗑️ Giveaway for **Nitro** has been deleted.',
      });
    });

    it('still deletes the record when the channel or message is already gone', async () => {
      const { ctx } = makeCtx({
        action: 'delete',
        strings: { giveaway: 'gw-1' },
        fetchChannel: null,
      });
      await command('giveaway').execute(ctx);
      expect(services.giveawayRepo.delete).toHaveBeenCalledWith('gw-1');

      const noMessage = makeCtx({
        action: 'delete',
        strings: { giveaway: 'gw-1' },
        fetchChannel: {
          isTextBased: () => true,
          messages: { fetch: vi.fn().mockResolvedValue(null) },
        },
      });
      await command('giveaway').execute(noMessage.ctx);
      expect(services.giveawayRepo.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('edit', () => {
    it('needs an id, an existing and an unfinished giveaway, and something to change', async () => {
      let made = makeCtx({ action: 'edit' });
      await command('giveaway').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('to edit');

      made = makeCtx({ action: 'edit', strings: { giveaway: 'nope' } });
      await command('giveaway').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('No giveaway found');

      services.giveawayRepo.findById.mockResolvedValue({ ...activeGiveaway, isEnded: true });
      made = makeCtx({ action: 'edit', strings: { giveaway: 'gw-1', prize: 'x' } });
      await command('giveaway').execute(made.ctx);
      expect(made.reply).toHaveBeenCalledWith({
        content: '⚠️ You cannot edit an ended giveaway.',
      });

      services.giveawayRepo.findById.mockResolvedValue({ ...activeGiveaway });
      made = makeCtx({ action: 'edit', strings: { giveaway: 'gw-1', duration: 'soon' } });
      await command('giveaway').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('at least one field');
      expect(services.giveawayRepo.update).not.toHaveBeenCalled();
    });

    it('updates prize, winners and end time, and refreshes the posted embed', async () => {
      const { ctx, reply } = makeCtx({
        action: 'edit',
        strings: { giveaway: 'gw-1', prize: 'Steam Key', duration: '1h' },
        integers: { winners: 5 },
      });
      await command('giveaway').execute(ctx);

      expect(services.giveawayRepo.update).toHaveBeenCalledWith('gw-1', {
        prize: 'Steam Key',
        winnerCount: 5,
        endsAt: new Date(NOW.getTime() + 3_600_000),
      });
      expect(services.giveawayEngine.formatGiveawayEmbed).toHaveBeenCalledWith(
        expect.objectContaining({ prize: 'Steam Key' }),
        3,
      );
      expect(hostedMessage.edit).toHaveBeenCalledWith({ embeds: [expect.anything()] });
      expect(reply).toHaveBeenCalledWith({
        content: '✓ Giveaway **Steam Key** updated successfully!',
      });
    });

    it('still reports success when the posted message cannot be refreshed', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      services.giveawayRepo.getEntryCount.mockRejectedValue(new Error('db'));
      const { ctx, reply } = makeCtx({
        action: 'edit',
        strings: { giveaway: 'gw-1', prize: 'Steam Key' },
      });
      await command('giveaway').execute(ctx);
      expect(error).toHaveBeenCalled();
      expect(reply.mock.calls[0]![0].content).toContain('updated successfully');
    });
  });

  describe('list', () => {
    it('shows every active giveaway with its channel, winners and timing', async () => {
      services.giveawayRepo.listActiveGiveaways.mockResolvedValue([
        activeGiveaway,
        { ...activeGiveaway, id: 'gw-2', prize: 'Hoodie', winnerCount: 2, messageId: 'msg-2' },
      ]);
      const { ctx, reply } = makeCtx({ action: 'list' });
      await command('giveaway').execute(ctx);
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      const endsUnix = Math.floor(activeGiveaway.endsAt.getTime() / 1000);
      expect(embed.description).toContain('**1. Nitro**');
      expect(embed.description).toContain('**2. Hoodie**');
      expect(embed.description).toContain('Winners: **2**');
      expect(embed.description).toContain(`<t:${endsUnix}:R>`);
      expect(embed.description).toContain('ID: `gw-2` | Message: `msg-2`');
      expect(embed.footer.text).toBe('Total Active: 2');
      expect(services.giveawayRepo.listActiveGiveaways).toHaveBeenCalledWith('guild-1');
    });
  });
});
