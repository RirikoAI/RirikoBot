import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { CommandCategory } from '@ririko/discord';
import { TICKET_OPEN_BUTTON_ID } from '@ririko/services';
import type { BotServices } from '../../../services.js';
import { DEFAULT_PANEL_MESSAGE, createTicketCommand } from '../ticket.command.js';

const GUILD_ID = '100000000000000001';
const CHANNEL_ID = '200000000000000001';
const PANEL_CHANNEL_ID = '200000000000000002';
const USER_ID = '300000000000000001';

const enabledSettings = {
  guildId: GUILD_ID,
  isEnabled: true,
  categoryId: '400000000000000001',
  staffRoleIds: [],
};

interface CtxOptions {
  source?: 'slash' | 'prefix';
  args?: string[];
  strings?: Record<string, string>;
  slashChannel?: { id: string } | null;
  slashUser?: { id: string } | null;
  perms?: bigint[];
  member?: unknown;
  guild?: unknown;
  channel?: unknown;
}

describe('/ticket command (TASK-1984)', () => {
  let ticketRepo: { getSettings: ReturnType<typeof vi.fn> };
  let ticketService: Record<'claim' | 'close' | 'add' | 'remove', ReturnType<typeof vi.fn>>;
  let services: BotServices;
  let panelSend: ReturnType<typeof vi.fn>;
  let panelChannel: { id: string; type: ChannelType; send: ReturnType<typeof vi.fn> };
  let ticketChannel: { id: string; type: ChannelType; send: ReturnType<typeof vi.fn> };
  let usersFetch: ReturnType<typeof vi.fn>;
  let channelFetch: ReturnType<typeof vi.fn>;
  let channelCache: Map<string, unknown>;

  const command = () => createTicketCommand(services);

  function makeCtx(opts: CtxOptions = {}) {
    const reply = vi.fn().mockResolvedValue(undefined);
    const deferReply = vi.fn().mockResolvedValue(undefined);
    const source = opts.source ?? 'slash';
    const perms = opts.perms ?? [];
    const member =
      opts.member === undefined
        ? {
            id: 'member-1',
            permissions: { has: (flag: bigint) => perms.includes(flag) },
          }
        : opts.member;
    const ctx: any = {
      source,
      guildId: GUILD_ID,
      guild:
        opts.guild === undefined
          ? { id: GUILD_ID, channels: { cache: channelCache, fetch: channelFetch } }
          : opts.guild,
      member,
      channel: opts.channel === undefined ? ticketChannel : opts.channel,
      client: { users: { fetch: usersFetch } },
      options: {
        getString: vi.fn((name: string) => opts.strings?.[name] ?? null),
        getChannel: vi.fn().mockResolvedValue(opts.slashChannel ?? null),
        getUser: vi.fn().mockResolvedValue(opts.slashUser ?? null),
        getRawArgs: vi.fn().mockReturnValue(opts.args ?? []),
      },
      reply,
      deferReply,
    };
    return { ctx, reply, deferReply };
  }

  function lastText(reply: ReturnType<typeof vi.fn>): string {
    return reply.mock.calls.at(-1)![0].content;
  }

  beforeEach(() => {
    panelSend = vi.fn().mockResolvedValue({ id: 'panel-msg' });
    panelChannel = { id: PANEL_CHANNEL_ID, type: ChannelType.GuildText, send: panelSend };
    ticketChannel = { id: CHANNEL_ID, type: ChannelType.GuildText, send: vi.fn() };
    channelCache = new Map<string, unknown>([[PANEL_CHANNEL_ID, panelChannel]]);
    channelFetch = vi.fn().mockResolvedValue(null);
    usersFetch = vi.fn().mockImplementation(async (id: string) => ({ id }));
    ticketRepo = { getSettings: vi.fn().mockResolvedValue(enabledSettings) };
    ticketService = {
      claim: vi.fn().mockResolvedValue({ ok: true, ticket: { number: 7 } }),
      close: vi.fn().mockResolvedValue({
        ok: true,
        ticket: { number: 7 },
        transcriptChannelId: 'log-1',
        channelDeleted: true,
      }),
      add: vi.fn().mockResolvedValue({ ok: true, ticket: { number: 7 } }),
      remove: vi.fn().mockResolvedValue({ ok: true, ticket: { number: 7 } }),
    };
    services = { ticketRepo, ticketService } as unknown as BotServices;
  });

  describe('metadata', () => {
    it('is a guild-registered utility command with the five actions and four options', () => {
      const { metadata } = command();
      expect(metadata.name).toBe('ticket');
      expect(metadata.registrationScope).toBe('guild');
      expect(metadata.category).toBe(CommandCategory.UTILITY);
      expect(metadata.isGuildOnly).toBe(true);
      const names = metadata.options!.map((o) => o.name);
      expect(names).toEqual(['action', 'channel', 'message', 'reason', 'user']);
      const action = metadata.options!.find((o) => o.name === 'action')!;
      expect(action.choices!.map((c) => c.value)).toEqual([
        'panel',
        'close',
        'claim',
        'add',
        'remove',
      ]);
      expect(metadata.prefixEnabled).not.toBe(false);
    });
  });

  describe('outside a server or with a bad action', () => {
    it('refuses without a guild or member', async () => {
      const { ctx, reply } = makeCtx({ guild: null });
      await command().execute(ctx);
      expect(lastText(reply)).toContain('only be used within a server');
      const second = makeCtx({ member: null });
      await command().execute(second.ctx);
      expect(lastText(second.reply)).toContain('only be used within a server');
    });

    it('shows the usage for a prefix command with no or an unknown action', async () => {
      const none = makeCtx({ source: 'prefix', args: [] });
      await command().execute(none.ctx);
      expect(lastText(none.reply)).toContain('Usage');
      const unknown = makeCtx({ source: 'prefix', args: ['bogus'] });
      await command().execute(unknown.ctx);
      expect(lastText(unknown.reply)).toContain('Usage');
      expect(ticketService.claim).not.toHaveBeenCalled();
    });
  });

  describe('action: panel', () => {
    it('refuses without Manage Server or Administrator', async () => {
      const { ctx, reply } = makeCtx({
        strings: { action: 'panel' },
        perms: [PermissionFlagsBits.ManageChannels],
      });
      await command().execute(ctx);
      expect(lastText(reply)).toContain('Manage Server or Administrator');
      expect(panelSend).not.toHaveBeenCalled();
      expect(ticketRepo.getSettings).not.toHaveBeenCalled();
    });

    it.each([
      ['Administrator', PermissionFlagsBits.Administrator],
      ['Manage Server', PermissionFlagsBits.ManageGuild],
    ])('lets %s post a panel in the chosen channel (slash)', async (_label, flag) => {
      const { ctx, reply } = makeCtx({
        strings: { action: 'panel', message: 'Need help?' },
        slashChannel: { id: PANEL_CHANNEL_ID },
        perms: [flag],
      });
      await command().execute(ctx);

      expect(panelSend).toHaveBeenCalledTimes(1);
      const payload = panelSend.mock.calls[0]![0];
      expect(payload.embeds[0].toJSON().description).toBe('Need help?');
      const button = payload.components[0].toJSON().components[0];
      expect(button.custom_id).toBe(TICKET_OPEN_BUTTON_ID);
      expect(button.label).toBe('Open Ticket');
      expect(lastText(reply)).toContain(`<#${PANEL_CHANNEL_ID}>`);
    });

    it('posts the default message in the current channel when none is given', async () => {
      const { ctx } = makeCtx({
        strings: { action: 'panel' },
        perms: [PermissionFlagsBits.Administrator],
        channel: panelChannel,
      });
      await command().execute(ctx);
      expect(panelSend.mock.calls[0]![0].embeds[0].toJSON().description).toBe(
        DEFAULT_PANEL_MESSAGE,
      );
    });

    it('cuts a very long message to 1,000 characters', async () => {
      const { ctx } = makeCtx({
        strings: { action: 'panel', message: 'x'.repeat(1500) },
        perms: [PermissionFlagsBits.Administrator],
        channel: panelChannel,
      });
      await command().execute(ctx);
      expect(panelSend.mock.calls[0]![0].embeds[0].toJSON().description).toHaveLength(1000);
    });

    it('works as a prefix command: channel mention and message', async () => {
      const { ctx, reply } = makeCtx({
        source: 'prefix',
        args: ['panel', `<#${PANEL_CHANNEL_ID}>`, 'Need', 'help?'],
        perms: [PermissionFlagsBits.Administrator],
      });
      await command().execute(ctx);
      expect(panelSend.mock.calls[0]![0].embeds[0].toJSON().description).toBe('Need help?');
      expect(lastText(reply)).toContain(PANEL_CHANNEL_ID);
    });

    it('accepts a bare channel id and no message in prefix form', async () => {
      const { ctx } = makeCtx({
        source: 'prefix',
        args: ['panel', PANEL_CHANNEL_ID],
        perms: [PermissionFlagsBits.Administrator],
      });
      await command().execute(ctx);
      expect(panelSend.mock.calls[0]![0].embeds[0].toJSON().description).toBe(
        DEFAULT_PANEL_MESSAGE,
      );
    });

    it('treats the whole prefix text as the message when it starts with no channel', async () => {
      const { ctx } = makeCtx({
        source: 'prefix',
        args: ['panel', 'Ask', 'us'],
        perms: [PermissionFlagsBits.Administrator],
        channel: panelChannel,
      });
      await command().execute(ctx);
      expect(panelSend.mock.calls[0]![0].embeds[0].toJSON().description).toBe('Ask us');
    });

    it('fetches a channel that is not cached', async () => {
      const other = {
        id: '200000000000000009',
        type: ChannelType.GuildAnnouncement,
        send: panelSend,
      };
      channelFetch.mockResolvedValue(other);
      const { ctx } = makeCtx({
        source: 'prefix',
        args: ['panel', other.id],
        perms: [PermissionFlagsBits.Administrator],
      });
      await command().execute(ctx);
      expect(channelFetch).toHaveBeenCalledWith(other.id);
      expect(panelSend).toHaveBeenCalledTimes(1);
    });

    it('refuses a channel that is missing or not a text channel', async () => {
      const missing = makeCtx({
        source: 'prefix',
        args: ['panel', '200000000000000099'],
        perms: [PermissionFlagsBits.Administrator],
      });
      await command().execute(missing.ctx);
      expect(lastText(missing.reply)).toContain('text channel');

      channelCache.set('200000000000000003', {
        id: '200000000000000003',
        type: ChannelType.GuildVoice,
      });
      const voice = makeCtx({
        source: 'prefix',
        args: ['panel', '200000000000000003'],
        perms: [PermissionFlagsBits.Administrator],
      });
      await command().execute(voice.ctx);
      expect(lastText(voice.reply)).toContain('text channel');

      const noChannel = makeCtx({
        strings: { action: 'panel' },
        perms: [PermissionFlagsBits.Administrator],
        channel: null,
      });
      await command().execute(noChannel.ctx);
      expect(lastText(noChannel.reply)).toContain('text channel');
      expect(panelSend).not.toHaveBeenCalled();
    });

    it('points to the dashboard when tickets are off, missing or have no category', async () => {
      for (const settings of [
        null,
        { ...enabledSettings, isEnabled: false },
        { ...enabledSettings, categoryId: null },
      ]) {
        ticketRepo.getSettings.mockResolvedValue(settings);
        const { ctx, reply } = makeCtx({
          strings: { action: 'panel' },
          perms: [PermissionFlagsBits.Administrator],
          channel: panelChannel,
        });
        await command().execute(ctx);
        expect(lastText(reply)).toContain('Tickets** page of the dashboard');
      }
      expect(panelSend).not.toHaveBeenCalled();
    });

    it('says so when Discord refuses the post', async () => {
      panelSend.mockRejectedValue(new Error('Missing Permissions'));
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { ctx, reply } = makeCtx({
        strings: { action: 'panel' },
        perms: [PermissionFlagsBits.Administrator],
        channel: panelChannel,
      });
      await command().execute(ctx);
      expect(lastText(reply)).toContain('could not post');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('actions inside a ticket channel', () => {
    it.each(['close', 'claim', 'add', 'remove'])(
      '%s refuses outside a ticket channel',
      async (action) => {
        const voice = makeCtx({
          strings: { action },
          channel: { id: 'x', type: ChannelType.GuildVoice },
        });
        await command().execute(voice.ctx);
        expect(lastText(voice.reply)).toBe('This channel is not an open ticket.');
        const none = makeCtx({ strings: { action }, channel: null });
        await command().execute(none.ctx);
        expect(lastText(none.reply)).toBe('This channel is not an open ticket.');
        expect(ticketService.claim).not.toHaveBeenCalled();
        expect(ticketService.close).not.toHaveBeenCalled();
        expect(ticketService.add).not.toHaveBeenCalled();
        expect(ticketService.remove).not.toHaveBeenCalled();
      },
    );

    it('claim calls the service and confirms (slash and prefix)', async () => {
      const slash = makeCtx({ strings: { action: 'claim' } });
      await command().execute(slash.ctx);
      expect(ticketService.claim).toHaveBeenCalledWith(slash.ctx.member, ticketChannel);
      expect(lastText(slash.reply)).toBe('You claimed this ticket.');
      expect(slash.reply.mock.calls[0]![0].ephemeral).toBe(true);

      const prefix = makeCtx({ source: 'prefix', args: ['claim'] });
      await command().execute(prefix.ctx);
      expect(ticketService.claim).toHaveBeenCalledTimes(2);
    });

    it('claim passes a refusal on', async () => {
      ticketService.claim.mockResolvedValue({ ok: false, message: 'Only the staff can do that.' });
      const { ctx, reply } = makeCtx({ strings: { action: 'claim' } });
      await command().execute(ctx);
      expect(lastText(reply)).toBe('Only the staff can do that.');
    });

    it('close defers, passes the reason and describes the result (slash)', async () => {
      const { ctx, reply, deferReply } = makeCtx({
        strings: { action: 'close', reason: 'Solved' },
      });
      await command().execute(ctx);
      expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(ticketService.close).toHaveBeenCalledWith(ctx.member, ticketChannel, 'Solved');
      expect(lastText(reply)).toBe('Ticket #0007 is closed. The transcript is in <#log-1>.');
    });

    it('close takes the reason from the prefix arguments', async () => {
      const { ctx } = makeCtx({ source: 'prefix', args: ['close', 'spam', 'and', 'ads'] });
      await command().execute(ctx);
      expect(ticketService.close).toHaveBeenCalledWith(ctx.member, ticketChannel, 'spam and ads');
    });

    it('close without a reason passes null', async () => {
      const { ctx } = makeCtx({ source: 'prefix', args: ['close'] });
      await command().execute(ctx);
      expect(ticketService.close).toHaveBeenCalledWith(ctx.member, ticketChannel, null);
    });

    it('close mentions a missing transcript and an undeleted channel', async () => {
      ticketService.close.mockResolvedValue({
        ok: true,
        ticket: { number: 12 },
        transcriptChannelId: null,
        channelDeleted: false,
      });
      const { ctx, reply } = makeCtx({ strings: { action: 'close' } });
      await command().execute(ctx);
      const text = lastText(reply);
      expect(text).toContain('Ticket #0012 is closed.');
      expect(text).toContain('No transcript was saved');
      expect(text).toContain('could not delete the channel');
    });

    it('close passes a refusal on, and survives a reply into a deleted channel', async () => {
      ticketService.close.mockResolvedValue({
        ok: false,
        message: 'The transcript could not be posted.',
      });
      const refused = makeCtx({ strings: { action: 'close' } });
      await command().execute(refused.ctx);
      expect(lastText(refused.reply)).toBe('The transcript could not be posted.');

      ticketService.close.mockResolvedValue({
        ok: true,
        ticket: { number: 1 },
        transcriptChannelId: 'log-1',
        channelDeleted: true,
      });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const gone = makeCtx({ strings: { action: 'close' } });
      gone.reply.mockRejectedValue(new Error('Unknown Channel'));
      await expect(command().execute(gone.ctx)).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Unknown Channel'));
      spy.mockRestore();
    });

    it('add and remove call the service with the slash user and confirm publicly', async () => {
      const user = { id: USER_ID };
      const add = makeCtx({ strings: { action: 'add' }, slashUser: user });
      await command().execute(add.ctx);
      expect(ticketService.add).toHaveBeenCalledWith(add.ctx.member, ticketChannel, user);
      expect(lastText(add.reply)).toBe(`Added <@${USER_ID}> to this ticket.`);
      expect(add.reply.mock.calls[0]![0].ephemeral).toBe(false);

      const remove = makeCtx({ strings: { action: 'remove' }, slashUser: user });
      await command().execute(remove.ctx);
      expect(ticketService.remove).toHaveBeenCalledWith(remove.ctx.member, ticketChannel, user);
      expect(lastText(remove.reply)).toBe(`Removed <@${USER_ID}> from this ticket.`);
    });

    it('add and remove resolve a prefix mention or id', async () => {
      const mention = makeCtx({ source: 'prefix', args: ['add', `<@!${USER_ID}>`] });
      await command().execute(mention.ctx);
      expect(usersFetch).toHaveBeenCalledWith(USER_ID);
      expect(ticketService.add).toHaveBeenCalledWith(
        mention.ctx.member,
        ticketChannel,
        expect.objectContaining({ id: USER_ID }),
      );

      const bare = makeCtx({ source: 'prefix', args: ['remove', USER_ID] });
      await command().execute(bare.ctx);
      expect(ticketService.remove).toHaveBeenCalledWith(
        bare.ctx.member,
        ticketChannel,
        expect.objectContaining({ id: USER_ID }),
      );
    });

    it('asks who when no user is given, and says when the user cannot be found', async () => {
      const slash = makeCtx({ strings: { action: 'add' } });
      await command().execute(slash.ctx);
      expect(lastText(slash.reply)).toContain('Say who to add');

      const garbage = makeCtx({ source: 'prefix', args: ['remove', 'nobody'] });
      await command().execute(garbage.ctx);
      expect(lastText(garbage.reply)).toContain('could not find that member');

      usersFetch.mockRejectedValue(new Error('Unknown User'));
      const unknown = makeCtx({ source: 'prefix', args: ['add', USER_ID] });
      await command().execute(unknown.ctx);
      expect(lastText(unknown.reply)).toContain('could not find that member');

      const noArg = makeCtx({ source: 'prefix', args: ['add'] });
      await command().execute(noArg.ctx);
      expect(lastText(noArg.reply)).toContain('could not find that member');
      expect(ticketService.add).not.toHaveBeenCalled();
      expect(ticketService.remove).not.toHaveBeenCalled();
    });

    it('add and remove pass a service refusal on', async () => {
      ticketService.add.mockResolvedValue({ ok: false, message: 'Only the staff can do that.' });
      ticketService.remove.mockResolvedValue({
        ok: false,
        message: 'The opener cannot be removed.',
      });
      const add = makeCtx({ strings: { action: 'add' }, slashUser: { id: USER_ID } });
      await command().execute(add.ctx);
      expect(lastText(add.reply)).toBe('Only the staff can do that.');
      const remove = makeCtx({ strings: { action: 'remove' }, slashUser: { id: USER_ID } });
      await command().execute(remove.ctx);
      expect(lastText(remove.reply)).toBe('The opener cannot be removed.');
    });
  });
});
