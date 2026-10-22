import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverwriteType, PermissionFlagsBits } from 'discord.js';
import type { AttachmentBuilder } from 'discord.js';
import type {
  GuildSettingsRepository,
  Ticket,
  TicketRepository,
  TicketSettings,
} from '@ririko/database';
import { TicketService } from '../ticket.service.js';
import { DEFAULT_TICKET_WELCOME } from '../messages.js';
import {
  T_NOW,
  asTextChannel,
  makeGuild,
  makeMember,
  makeMessage,
  makeSettings,
  makeTicket,
  makeTicketChannel,
  makeUser,
} from './fixtures.js';

const SECRET = 'my password is hunter2';

function makeRepos() {
  const ticketRepo = {
    getSettings: vi.fn<(...args: unknown[]) => Promise<TicketSettings | null>>(),
    countOpenForUser: vi.fn().mockResolvedValue(0),
    openTicket: vi.fn(),
    findByChannelId: vi.fn<(...args: unknown[]) => Promise<Ticket | null>>(),
    setClaimedBy: vi.fn(),
    close: vi.fn().mockResolvedValue(true),
  };
  ticketRepo.getSettings.mockResolvedValue(makeSettings());
  const guildSettingsRepo = {
    findById: vi.fn().mockResolvedValue({ guildId: 'g1', logChannelId: null }),
  };
  return {
    ticketRepo,
    guildSettingsRepo,
    service: new TicketService(
      ticketRepo as unknown as TicketRepository,
      guildSettingsRepo as unknown as GuildSettingsRepository,
      { now: () => T_NOW },
    ),
  };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function loggedText(): string {
  return JSON.stringify(errorSpy.mock.calls);
}

describe('TicketService.open', () => {
  function setup(guildOptions: Parameters<typeof makeGuild>[0] = {}) {
    const repos = makeRepos();
    const fake = makeGuild(guildOptions);
    repos.ticketRepo.openTicket.mockImplementation(async (input: Record<string, unknown>) =>
      makeTicket({
        number: 42,
        channelId: String(input.channelId),
        openerId: String(input.openerId),
        subject: (input.subject as string | null) ?? null,
      }),
    );
    const member = makeMember('opener', fake.guild);
    return { ...repos, ...fake, member };
  }

  async function expectRefusal(
    s: ReturnType<typeof setup>,
    pattern: RegExp | string,
  ): Promise<void> {
    const result = await s.service.open(s.member, 'help');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(pattern);
    expect(s.guild.channels.create).not.toHaveBeenCalled();
    expect(s.ticketRepo.openTicket).not.toHaveBeenCalled();
  }

  it('refuses when the server has no settings', async () => {
    const s = setup();
    s.ticketRepo.getSettings.mockResolvedValue(null);
    await expectRefusal(s, /not turned on/);
  });

  it('refuses when tickets are disabled', async () => {
    const s = setup();
    s.ticketRepo.getSettings.mockResolvedValue(makeSettings({ isEnabled: false }));
    await expectRefusal(s, /not turned on/);
  });

  it('refuses when no category is set', async () => {
    const s = setup();
    s.ticketRepo.getSettings.mockResolvedValue(makeSettings({ categoryId: null }));
    await expectRefusal(s, /no category/);
  });

  it('refuses when the category is gone', async () => {
    const s = setup();
    s.ticketRepo.getSettings.mockResolvedValue(makeSettings({ categoryId: 'deleted' }));
    await expectRefusal(s, /no longer exists/);
  });

  it('refuses when the category id points at a channel that is not a category', async () => {
    const s = setup({ channels: { text1: { id: 'text1', type: 0 } } });
    s.ticketRepo.getSettings.mockResolvedValue(makeSettings({ categoryId: 'text1' }));
    await expectRefusal(s, /no longer exists/);
  });

  it('refuses when the category lookup fails', async () => {
    const s = setup();
    s.guild.channels.fetch.mockRejectedValue(new Error('Unknown Channel'));
    await expectRefusal(s, /no longer exists/);
  });

  it.each([
    [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
    [PermissionFlagsBits.ViewChannel, 'View Channel'],
    [PermissionFlagsBits.SendMessages, 'Send Messages'],
  ])('refuses when Ririko lacks %s in the category', async (missing, name) => {
    const all = [
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ];
    const s = setup({ botPermissions: all.filter((flag) => flag !== missing) });
    await expectRefusal(s, `Ririko needs ${name} in the ticket category`);
  });

  it('names every missing permission, and treats unknown permissions as all missing', async () => {
    const s = setup({ botPermissions: [] });
    await expectRefusal(s, 'Manage Channels, View Channel, Send Messages');

    const noPerms = setup();
    noPerms.category.permissionsFor.mockReturnValue(null as never);
    await expectRefusal(noPerms, 'Manage Channels, View Channel, Send Messages');
  });

  it('refuses when Ririko is not in the guild member cache and cannot be fetched', async () => {
    const s = setup({ noBot: true });
    await expectRefusal(s, 'Manage Channels, View Channel, Send Messages');
  });

  it('fetches Ririko as a member when the cache lacks it', async () => {
    const s = setup({ noBot: true });
    s.guild.members.fetchMe.mockResolvedValue({ id: 'bot' });
    const result = await s.service.open(s.member, 'help');
    expect(result.ok).toBe(true);
  });

  it('refuses a member who is at the limit of one open ticket', async () => {
    const s = setup();
    s.ticketRepo.countOpenForUser.mockResolvedValue(1);
    await expectRefusal(s, /already have an open ticket/);
    expect(s.ticketRepo.countOpenForUser).toHaveBeenCalledWith('g1', 'opener');
  });

  it('refuses a member who is at a higher limit', async () => {
    const s = setup();
    s.ticketRepo.getSettings.mockResolvedValue(makeSettings({ maxOpenPerUser: 3 }));
    s.ticketRepo.countOpenForUser.mockResolvedValue(3);
    await expectRefusal(s, /already have 3 open tickets/);
  });

  it('lets a member with fewer open tickets than the limit open one', async () => {
    const s = setup();
    s.ticketRepo.getSettings.mockResolvedValue(makeSettings({ maxOpenPerUser: 3 }));
    s.ticketRepo.countOpenForUser.mockResolvedValue(2);
    expect((await s.service.open(s.member, 'help')).ok).toBe(true);
  });

  it('creates a private channel under the category with the right overwrites', async () => {
    const s = setup();
    const result = await s.service.open(s.member, 'Cannot log in');

    expect(s.guild.channels.create).toHaveBeenCalledTimes(1);
    const options = s.guild.channels.create.mock.calls[0]?.[0];
    expect(options).toMatchObject({ name: 'ticket-0042', type: 0, parent: 'cat1' });
    const allow = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ReadMessageHistory,
    ];
    expect(options.permissionOverwrites).toEqual([
      { id: 'g1', type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
      { id: 'opener', type: OverwriteType.Member, allow },
      { id: 'bot', type: OverwriteType.Member, allow },
      { id: 'staff1', type: OverwriteType.Role, allow },
      { id: 'staff2', type: OverwriteType.Role, allow },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(s.ticketRepo.openTicket).toHaveBeenCalledWith({
      guildId: 'g1',
      channelId: 'chan-new',
      openerId: 'opener',
      subject: 'Cannot log in',
    });
    expect(result.ticket.number).toBe(42);
    expect(result.welcomePosted).toBe(true);
    expect(s.created.setName).not.toHaveBeenCalled();
  });

  it('leaves out staff roles that no longer exist and keeps the subject short', async () => {
    const s = setup({ roles: ['staff2'] });
    await s.service.open(s.member, `  ${'x'.repeat(500)}  `);

    const ids = s.guild.channels.create.mock.calls[0]?.[0].permissionOverwrites.map(
      (o: { id: string }) => o.id,
    );
    expect(ids).toEqual(['g1', 'opener', 'bot', 'staff2']);
    const recorded = s.ticketRepo.openTicket.mock.calls[0]?.[0];
    expect(recorded.subject).toHaveLength(200);
  });

  it('records no subject when it is blank or missing', async () => {
    const s = setup();
    await s.service.open(s.member, '   ');
    await s.service.open(s.member, null);
    expect(s.ticketRepo.openTicket.mock.calls.map(([input]) => input.subject)).toEqual([
      null,
      null,
    ]);
  });

  it('posts the welcome embed with the opener, the subject, the staff roles and both buttons', async () => {
    const s = setup();
    await s.service.open(s.member, 'Cannot log in');

    expect(s.created.send).toHaveBeenCalledTimes(1);
    const sent = s.created.send.mock.calls[0]?.[0];
    expect(sent.content).toBe('<@opener> <@&staff1> <@&staff2>');
    const embed = sent.embeds[0].toJSON();
    expect(embed.description).toBe(DEFAULT_TICKET_WELCOME);
    expect(embed.fields).toEqual([
      { name: 'Opened by', value: '<@opener>', inline: true },
      { name: 'Subject', value: 'Cannot log in', inline: true },
      { name: 'Staff', value: '<@&staff1> <@&staff2>' },
    ]);
    const buttons = sent.components[0].toJSON().components;
    expect(buttons.map((b: { custom_id: string }) => b.custom_id)).toEqual([
      'ticket:claim',
      'ticket:close',
    ]);
  });

  it("posts the server's own welcome message when it has one", async () => {
    const s = setup();
    s.ticketRepo.getSettings.mockResolvedValue(makeSettings({ welcomeMessage: 'Welcome aboard' }));
    await s.service.open(s.member, 'help');
    expect(s.created.send.mock.calls[0]?.[0].embeds[0].toJSON().description).toBe('Welcome aboard');
  });

  it('numbers the channel from the settings counter, and renames it when another ticket took that number', async () => {
    const s = setup();
    s.ticketRepo.getSettings.mockResolvedValue(makeSettings({ nextNumber: 41 }));
    const result = await s.service.open(s.member, 'help');

    expect(s.guild.channels.create.mock.calls[0]?.[0].name).toBe('ticket-0041');
    expect(s.created.setName).toHaveBeenCalledWith('ticket-0042');
    expect(result.ok).toBe(true);
  });

  it('keeps the ticket when the rename fails', async () => {
    const s = setup();
    s.ticketRepo.getSettings.mockResolvedValue(makeSettings({ nextNumber: 41 }));
    s.created.setName.mockRejectedValue(new Error('rate limited'));
    const result = await s.service.open(s.member, 'help');

    expect(result.ok).toBe(true);
    expect(loggedText()).toContain('Could not rename');
  });

  it('creates nothing and records nothing when Discord refuses to create the channel', async () => {
    const s = setup();
    s.guild.channels.create.mockRejectedValue(new Error('Maximum number of channels in category'));
    const result = await s.service.open(s.member, 'help');

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toMatch(/category may be full/);
    expect(s.ticketRepo.openTicket).not.toHaveBeenCalled();
  });

  it('deletes the channel again when recording the ticket fails', async () => {
    const s = setup();
    s.ticketRepo.openTicket.mockRejectedValue(new Error('database is locked'));
    const result = await s.service.open(s.member, 'help');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/could not be saved/);
    expect(s.created.delete).toHaveBeenCalledTimes(1);
    expect(s.created.send).not.toHaveBeenCalled();
  });

  it('still reports the failure when the rollback delete fails too', async () => {
    const s = setup();
    s.ticketRepo.openTicket.mockRejectedValue(new Error('database is locked'));
    s.created.delete.mockRejectedValue(new Error('Missing Access'));
    const result = await s.service.open(s.member, 'help');

    expect(result.ok).toBe(false);
    expect(loggedText()).toContain('Could not remove channel chan-new');
  });

  it('reports the ticket as opened when only the welcome message fails', async () => {
    const s = setup();
    s.created.send.mockRejectedValue(new Error('Missing Permissions'));
    const result = await s.service.open(s.member, 'help');

    expect(result).toMatchObject({ ok: true, welcomePosted: false });
    expect(s.created.delete).not.toHaveBeenCalled();
  });
});

describe('TicketService staff actions', () => {
  function setup(ticket: Ticket | null = makeTicket()) {
    const repos = makeRepos();
    const fake = makeGuild();
    const channel = makeTicketChannel(fake.guild);
    repos.ticketRepo.findByChannelId.mockResolvedValue(ticket);
    repos.ticketRepo.setClaimedBy.mockImplementation(async (_id: string, by: string) =>
      makeTicket({ claimedBy: by }),
    );
    const staff = makeMember('staff', fake.guild, { roles: ['staff2'] });
    const opener = makeMember('opener', fake.guild);
    const stranger = makeMember('stranger', fake.guild);
    return {
      ...repos,
      ...fake,
      channel: asTextChannel(channel),
      raw: channel,
      staff,
      opener,
      stranger,
    };
  }

  describe('claim', () => {
    it('says so when the channel is not an open ticket', async () => {
      for (const ticket of [null, makeTicket({ status: 'closed' })]) {
        const s = setup(ticket);
        expect(await s.service.claim(s.staff, s.channel)).toEqual({
          ok: false,
          message: 'This channel is not an open ticket.',
        });
        expect(s.ticketRepo.setClaimedBy).not.toHaveBeenCalled();
      }
    });

    it('refuses members who are not staff, the opener included', async () => {
      const s = setup();
      for (const member of [s.stranger, s.opener]) {
        const result = await s.service.claim(member, s.channel);
        expect(result).toEqual({ ok: false, message: 'Only the staff can do that.' });
      }
      expect(s.ticketRepo.setClaimedBy).not.toHaveBeenCalled();
    });

    it('refuses everyone when the server has no settings and no permissions apply', async () => {
      const s = setup();
      s.ticketRepo.getSettings.mockResolvedValue(null);
      expect((await s.service.claim(s.staff, s.channel)).ok).toBe(false);
    });

    it.each([
      ['a staff role', { roles: ['staff1'] }],
      ['Manage Channels', { permissions: [PermissionFlagsBits.ManageChannels] }],
      ['Administrator', { permissions: [PermissionFlagsBits.Administrator] }],
    ])('lets a member with %s claim, records it and announces it', async (_name, access) => {
      const s = setup();
      const member = makeMember('claimer', s.guild, access);
      const result = await s.service.claim(member, s.channel);

      expect(result.ok).toBe(true);
      expect(s.ticketRepo.setClaimedBy).toHaveBeenCalledWith('ticket-id-1', 'claimer');
      expect(s.raw.send).toHaveBeenCalledWith({
        content: '<@claimer> is handling this ticket.',
        allowedMentions: { parse: [] },
      });
    });

    it('says who has a ticket that is already claimed', async () => {
      const s = setup(makeTicket({ claimedBy: 'someone-else' }));
      const result = await s.service.claim(s.staff, s.channel);
      expect(result).toEqual({
        ok: false,
        message: 'This ticket is already claimed by <@someone-else>.',
      });
      expect(s.ticketRepo.setClaimedBy).not.toHaveBeenCalled();
    });

    it('tells the claimer when they already hold the ticket', async () => {
      const s = setup(makeTicket({ claimedBy: 'staff' }));
      const result = await s.service.claim(s.staff, s.channel);
      expect(result).toEqual({ ok: false, message: 'You have already claimed this ticket.' });
    });

    it('refuses when the ticket closed while claiming', async () => {
      const s = setup();
      s.ticketRepo.setClaimedBy.mockResolvedValue(null);
      const result = await s.service.claim(s.staff, s.channel);
      expect(result.ok).toBe(false);
      expect(s.raw.send).not.toHaveBeenCalled();
    });

    it('still succeeds when the announcement cannot be posted', async () => {
      const s = setup();
      s.raw.send.mockRejectedValue(new Error('Missing Permissions'));
      expect((await s.service.claim(s.staff, s.channel)).ok).toBe(true);
      expect(loggedText()).toContain('Could not announce a claim');
    });
  });

  describe('add', () => {
    it('refuses outside a ticket and for non-staff', async () => {
      const none = setup(null);
      expect((await none.service.add(none.staff, none.channel, makeUser('new'))).ok).toBe(false);

      const s = setup();
      expect(await s.service.add(s.opener, s.channel, makeUser('new'))).toEqual({
        ok: false,
        message: 'Only the staff can do that.',
      });
      expect(s.raw.permissionOverwrites.edit).not.toHaveBeenCalled();
    });

    it("changes only that user's overwrite", async () => {
      const s = setup();
      const result = await s.service.add(s.staff, s.channel, makeUser('new'));

      expect(result.ok).toBe(true);
      expect(s.raw.permissionOverwrites.edit).toHaveBeenCalledTimes(1);
      expect(s.raw.permissionOverwrites.edit).toHaveBeenCalledWith('new', {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true,
      });
      expect(s.raw.permissionOverwrites.delete).not.toHaveBeenCalled();
    });

    it('does not add the opener, who is already in', async () => {
      const s = setup();
      const result = await s.service.add(s.staff, s.channel, makeUser('opener'));
      expect(result.ok).toBe(false);
      expect(s.raw.permissionOverwrites.edit).not.toHaveBeenCalled();
    });

    it('reports a Discord refusal', async () => {
      const s = setup();
      s.raw.permissionOverwrites.edit.mockRejectedValue(new Error('Missing Permissions'));
      const result = await s.service.add(s.staff, s.channel, makeUser('new'));
      expect(result).toEqual({
        ok: false,
        message: 'Discord refused to add that member to the ticket.',
      });
    });
  });

  describe('remove', () => {
    it('refuses outside a ticket and for non-staff', async () => {
      const none = setup(null);
      expect((await none.service.remove(none.staff, none.channel, makeUser('x'))).ok).toBe(false);

      const s = setup();
      expect(await s.service.remove(s.stranger, s.channel, makeUser('x'))).toEqual({
        ok: false,
        message: 'Only the staff can do that.',
      });
      expect(s.raw.permissionOverwrites.delete).not.toHaveBeenCalled();
    });

    it("deletes only that user's overwrite", async () => {
      const s = setup();
      const result = await s.service.remove(s.staff, s.channel, makeUser('guest'));

      expect(result.ok).toBe(true);
      expect(s.raw.permissionOverwrites.delete).toHaveBeenCalledTimes(1);
      expect(s.raw.permissionOverwrites.delete).toHaveBeenCalledWith('guest');
      expect(s.raw.permissionOverwrites.edit).not.toHaveBeenCalled();
    });

    it('never removes the opener', async () => {
      const s = setup();
      const result = await s.service.remove(s.staff, s.channel, makeUser('opener'));
      expect(result).toEqual({
        ok: false,
        message: 'The person who opened the ticket cannot be removed.',
      });
      expect(s.raw.permissionOverwrites.delete).not.toHaveBeenCalled();
    });

    it('never removes Ririko', async () => {
      const s = setup();
      const result = await s.service.remove(s.staff, s.channel, makeUser('bot'));
      expect(result.ok).toBe(false);
      expect(s.raw.permissionOverwrites.delete).not.toHaveBeenCalled();
    });

    it('reports a Discord refusal', async () => {
      const s = setup();
      s.raw.permissionOverwrites.delete.mockRejectedValue(new Error('Missing Permissions'));
      const result = await s.service.remove(s.staff, s.channel, makeUser('guest'));
      expect(result).toEqual({
        ok: false,
        message: 'Discord refused to remove that member from the ticket.',
      });
    });
  });
});

describe('TicketService.close', () => {
  function setup(options: { ticket?: Ticket | null; settings?: TicketSettings | null } = {}) {
    const repos = makeRepos();
    const fake = makeGuild();
    const channel = makeTicketChannel(fake.guild);
    repos.ticketRepo.findByChannelId.mockResolvedValue(
      options.ticket === undefined ? makeTicket({ claimedBy: 'staff' }) : options.ticket,
    );
    if (options.settings !== undefined)
      repos.ticketRepo.getSettings.mockResolvedValue(options.settings);
    // Newest first, as Discord returns it.
    channel.messages.fetch.mockResolvedValueOnce(
      new Map([
        ['m2', makeMessage(2, { content: SECRET })],
        ['m1', makeMessage(1, { content: 'second message' })],
      ]),
    );
    const staff = makeMember('staff', fake.guild, { roles: ['staff1'] });
    const opener = makeMember('opener', fake.guild);
    const stranger = makeMember('stranger', fake.guild);
    return {
      ...repos,
      ...fake,
      channel: asTextChannel(channel),
      raw: channel,
      staff,
      opener,
      stranger,
    };
  }

  function sentTranscript(s: ReturnType<typeof setup>) {
    const sent = s.transcripts.send.mock.calls[0]?.[0] as {
      embeds: { title: string; fields: { name: string; value: string }[] }[];
      files: AttachmentBuilder[];
      allowedMentions: unknown;
    };
    const file = sent.files[0]!;
    return { sent, name: file.name, text: (file.attachment as Buffer).toString('utf8') };
  }

  it('says so when the channel is not an open ticket', async () => {
    for (const ticket of [null, makeTicket({ status: 'closed' })]) {
      const s = setup({ ticket });
      expect(await s.service.close(s.staff, s.channel, null)).toEqual({
        ok: false,
        message: 'This channel is not an open ticket.',
      });
      expect(s.ticketRepo.close).not.toHaveBeenCalled();
    }
  });

  it('refuses a member who is neither the opener nor staff', async () => {
    const s = setup();
    const result = await s.service.close(s.stranger, s.channel, null);
    expect(result.ok).toBe(false);
    expect(s.transcripts.send).not.toHaveBeenCalled();
    expect(s.raw.delete).not.toHaveBeenCalled();
  });

  it('lets the opener close their own ticket even when the server has no settings', async () => {
    const s = setup({ settings: null });
    // No settings means no transcript channel, and the log channel is empty.
    const result = await s.service.close(s.opener, s.channel, null);
    expect(result).toMatchObject({ ok: true, transcriptChannelId: null, channelDeleted: true });
  });

  it('builds the transcript, posts it, and only then marks the ticket closed and deletes the channel', async () => {
    const s = setup();
    const order: string[] = [];
    s.transcripts.send.mockImplementation(async () => void order.push('post'));
    s.ticketRepo.close.mockImplementation(async () => {
      order.push('close');
      return true;
    });
    s.raw.delete.mockImplementation(async () => void order.push('delete'));

    const result = await s.service.close(s.staff, s.channel, 'Solved');

    expect(order).toEqual(['post', 'close', 'delete']);
    expect(result).toMatchObject({
      ok: true,
      transcriptChannelId: 'transcripts',
      channelDeleted: true,
    });
    expect(s.ticketRepo.close).toHaveBeenCalledWith('ticket-id-1', {
      closedBy: 'staff',
      reason: 'Solved',
      closedAt: T_NOW,
    });
  });

  it('posts a utf-8 file ticket-<number>.txt with the header and the messages oldest first', async () => {
    const s = setup();
    s.raw.messages.fetch.mockReset();
    s.raw.messages.fetch.mockResolvedValueOnce(
      new Map([
        [
          'm2',
          makeMessage(2, {
            content: 'Grüße ✓',
            attachments: new Map([['a', { url: 'https://cdn.example/x.png' }]]),
            embeds: [{ title: 'An embed' }],
          }),
        ],
        ['m1', makeMessage(1, { content: 'first' })],
      ]),
    );
    s.raw.messages.fetch.mockResolvedValueOnce(new Map());
    await s.service.close(s.staff, s.channel, 'Solved');

    const { name, text, sent } = sentTranscript(s);
    expect(name).toBe('ticket-0042.txt');
    expect(text).toContain('Server:      Test Guild (g1)');
    expect(text).toContain('Ticket:      #0042');
    expect(text).toContain('Subject:     Cannot log in');
    expect(text).toContain('Opened by:   opener#0 (opener)');
    expect(text).toContain('Claimed by:  staff#0 (staff)');
    expect(text).toContain('Closed by:   staff#0 (staff)');
    expect(text).toContain('Reason:      Solved');
    expect(text).toContain('Opened at:   2026-10-21 10:00:00 UTC');
    expect(text).toContain('Closed at:   2026-10-21 12:30:15 UTC');
    expect(text.indexOf('first')).toBeLessThan(text.indexOf('Grüße ✓'));
    expect(text).toContain('  [attachment] https://cdn.example/x.png');
    expect(text).toContain('  [embed] An embed');
    expect(sent.embeds[0]?.title).toBe('Ticket #0042 closed');
    expect(sent.allowedMentions).toEqual({ parse: [] });
    const fields = Object.fromEntries(sent.embeds[0]!.fields.map((f) => [f.name, f.value]));
    expect(fields).toMatchObject({ 'Closed by': '<@staff>', Reason: 'Solved', Messages: '2' });
  });

  it('shows unknown users when the opener has left and cannot be fetched', async () => {
    const s = setup({ ticket: makeTicket({ claimedBy: null }) });
    s.guild.client.users.fetch.mockRejectedValue(new Error('Unknown User'));
    await s.service.close(s.staff, s.channel, null);

    const { text } = sentTranscript(s);
    expect(text).toContain('Opened by:   unknown user (opener)');
    expect(text).toContain('Claimed by:  nobody');
    expect(text).toContain('Reason:      none');
  });

  it('keeps a long reason to its limit', async () => {
    const s = setup();
    await s.service.close(s.staff, s.channel, ` ${'r'.repeat(900)} `);
    expect(s.ticketRepo.close.mock.calls[0]?.[1].reason).toHaveLength(500);
    s.ticketRepo.close.mockClear();

    const t = setup();
    await t.service.close(t.staff, t.channel, '   ');
    expect(t.ticketRepo.close.mock.calls[0]?.[1].reason).toBeNull();
  });

  it('notes the cut-off for a ticket of more than 5,000 messages', async () => {
    const s = setup();
    s.raw.messages.fetch.mockReset();
    let served = 0;
    s.raw.messages.fetch.mockImplementation(async (options: { limit: number }) => {
      const page = new Map<string, unknown>();
      for (let i = 0; i < options.limit; i++) {
        const message = makeMessage(100000 - served);
        page.set(message.id, message);
        served++;
      }
      return page;
    });
    await s.service.close(s.staff, s.channel, null);

    const { text, sent } = sentTranscript(s);
    expect(text).toContain('Messages:    5000');
    expect(text).toContain('Note: this ticket has more than 5000 messages.');
    expect(sent.embeds[0]?.fields.find((f) => f.name === 'Messages')?.value).toBe(
      '5000 (newest only)',
    );
  });

  it('posts to the log channel when no transcript channel is set', async () => {
    const s = setup({ settings: makeSettings({ transcriptChannelId: null }) });
    s.guildSettingsRepo.findById.mockResolvedValue({ guildId: 'g1', logChannelId: 'logs' });
    const logs = { ...s.transcripts, id: 'logs', send: vi.fn().mockResolvedValue({}) };
    s.guild.channels.fetch.mockImplementation(async (id: string) => (id === 'logs' ? logs : null));

    const result = await s.service.close(s.staff, s.channel, null);

    expect(result).toMatchObject({ ok: true, transcriptChannelId: 'logs' });
    expect(logs.send).toHaveBeenCalledTimes(1);
    expect(s.guildSettingsRepo.findById).toHaveBeenCalledWith('g1');
  });

  it('closes with no transcript when neither channel is set', async () => {
    for (const lookup of [
      () => Promise.resolve({ guildId: 'g1', logChannelId: null }),
      () => Promise.resolve(null),
      () => Promise.reject(new Error('db down')),
    ]) {
      const s = setup({ settings: makeSettings({ transcriptChannelId: null }) });
      s.guildSettingsRepo.findById.mockImplementation(lookup);

      const result = await s.service.close(s.staff, s.channel, null);

      expect(result).toMatchObject({ ok: true, transcriptChannelId: null });
      expect(s.raw.messages.fetch).not.toHaveBeenCalled();
      expect(s.ticketRepo.close).toHaveBeenCalledTimes(1);
      expect(s.raw.delete).toHaveBeenCalledTimes(1);
    }
  });

  describe('when the transcript cannot be posted', () => {
    async function expectStaysOpen(s: ReturnType<typeof setup>, pattern: RegExp) {
      const result = await s.service.close(s.staff, s.channel, 'Solved');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toMatch(pattern);
        expect(result.message).toMatch(/stays open/);
      }
      expect(s.ticketRepo.close).not.toHaveBeenCalled();
      expect(s.raw.delete).not.toHaveBeenCalled();
    }

    it('keeps the ticket and the channel when the send fails', async () => {
      const s = setup();
      s.transcripts.send.mockRejectedValue(new Error('Missing Access'));
      await expectStaysOpen(s, /could not be posted/);
      expect(loggedText()).toContain('Could not post the transcript of ticket ticket-id-1');
    });

    it('keeps the ticket when the transcript channel is gone', async () => {
      const s = setup({ settings: makeSettings({ transcriptChannelId: 'deleted' }) });
      await expectStaysOpen(s, /no longer exists/);
    });

    it('keeps the ticket when the transcript channel is not a text channel', async () => {
      const s = setup();
      s.guild.channels.fetch.mockResolvedValue({ id: 'transcripts', isTextBased: () => false });
      await expectStaysOpen(s, /no longer exists or is not a text channel/);
    });

    it('keeps the ticket when Ririko may not post in the transcript channel', async () => {
      const s = setup();
      s.transcripts.permissionsFor.mockReturnValue({ has: () => false } as never);
      await expectStaysOpen(s, /cannot send messages, embeds and files/);
      expect(s.transcripts.send).not.toHaveBeenCalled();
    });

    it('keeps the ticket when permissions are unknown', async () => {
      const s = setup();
      s.transcripts.permissionsFor.mockReturnValue(null as never);
      await expectStaysOpen(s, /cannot send messages/);
    });

    it('keeps the ticket when the history cannot be read, without logging its content', async () => {
      const s = setup();
      s.raw.messages.fetch.mockReset();
      s.raw.messages.fetch.mockRejectedValue(new Error('Missing Access'));
      await expectStaysOpen(s, /could not be posted/);
      expect(s.transcripts.send).not.toHaveBeenCalled();
    });

    it('does not check the destination permissions when Ririko is not in the member cache', async () => {
      const s = setup();
      s.guild.members.me = null as never;
      s.transcripts.permissionsFor.mockReturnValue({ has: () => false } as never);
      const result = await s.service.close(s.staff, s.channel, null);
      expect(result.ok).toBe(true);
    });
  });

  it('reports a ticket that was closed by someone else in the meantime', async () => {
    const s = setup();
    s.ticketRepo.close.mockResolvedValue(false);
    const result = await s.service.close(s.staff, s.channel, null);
    expect(result.ok).toBe(false);
    expect(s.raw.delete).not.toHaveBeenCalled();
  });

  it('reports the ticket as closed when only the channel delete fails', async () => {
    const s = setup();
    s.raw.delete.mockRejectedValue(new Error('Missing Permissions'));
    const result = await s.service.close(s.staff, s.channel, null);

    expect(result).toMatchObject({ ok: true, channelDeleted: false });
    expect(s.ticketRepo.close).toHaveBeenCalledTimes(1);
    expect(loggedText()).toContain('Could not delete channel chan1');
  });

  it('posts one transcript when Close is pressed twice at once', async () => {
    const s = setup();
    let release: () => void = () => undefined;
    s.transcripts.send.mockImplementation(
      () => new Promise<void>((resolve) => void (release = resolve)),
    );

    const first = s.service.close(s.staff, s.channel, null);
    // Let the first call reach the pending send.
    await vi.waitFor(() => expect(s.transcripts.send).toHaveBeenCalled());
    const second = await s.service.close(s.opener, s.channel, null);
    release();
    const firstResult = await first;

    expect(second).toEqual({ ok: false, message: 'This ticket is already being closed.' });
    expect(firstResult.ok).toBe(true);
    expect(s.transcripts.send).toHaveBeenCalledTimes(1);

    // The lock is released afterwards, so a later close (of a ticket that stayed open) can run.
    s.transcripts.send.mockResolvedValue({});
    s.raw.messages.fetch.mockResolvedValue(new Map());
    expect((await s.service.close(s.staff, s.channel, null)).ok).toBe(true);
  });

  it('never writes message content or the transcript to the console', async () => {
    const s = setup();
    s.transcripts.send.mockRejectedValue(new Error('Missing Access'));
    await s.service.close(s.staff, s.channel, 'Solved');

    expect(errorSpy).toHaveBeenCalled();
    expect(loggedText()).not.toContain(SECRET);
    expect(loggedText()).not.toContain('second message');
    expect(loggedText()).not.toContain('Ticket:');
  });

  it('writes nothing of the ticket to the repository except the close record', async () => {
    const s = setup();
    await s.service.close(s.staff, s.channel, 'Solved');

    const stored = JSON.stringify([
      s.ticketRepo.close.mock.calls,
      s.ticketRepo.setClaimedBy.mock.calls,
      s.ticketRepo.openTicket.mock.calls,
    ]);
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toContain('Test Guild (g1)');
  });
});

describe('TicketService.handleChannelDeleted', () => {
  it('closes an open ticket with no closer, the reason "Channel deleted" and no transcript', async () => {
    const { service, ticketRepo, guildSettingsRepo } = makeRepos();
    ticketRepo.findByChannelId.mockResolvedValue(makeTicket());

    expect(await service.handleChannelDeleted('chan1')).toBe(true);

    expect(ticketRepo.close).toHaveBeenCalledWith('ticket-id-1', {
      closedBy: null,
      reason: 'Channel deleted',
      closedAt: T_NOW,
    });
    expect(guildSettingsRepo.findById).not.toHaveBeenCalled();
  });

  it('ignores channels that are not tickets and tickets that are already closed', async () => {
    const { service, ticketRepo } = makeRepos();
    ticketRepo.findByChannelId.mockResolvedValueOnce(null);
    expect(await service.handleChannelDeleted('other')).toBe(false);

    ticketRepo.findByChannelId.mockResolvedValueOnce(makeTicket({ status: 'closed' }));
    expect(await service.handleChannelDeleted('chan1')).toBe(false);
    expect(ticketRepo.close).not.toHaveBeenCalled();
  });

  it('uses the real clock when none is given', async () => {
    const { ticketRepo, guildSettingsRepo } = makeRepos();
    const service = new TicketService(
      ticketRepo as unknown as TicketRepository,
      guildSettingsRepo as unknown as GuildSettingsRepository,
    );
    ticketRepo.findByChannelId.mockResolvedValue(makeTicket());
    await service.handleChannelDeleted('chan1');
    expect(ticketRepo.close.mock.calls[0]?.[1].closedAt).toBeInstanceOf(Date);
  });
});
