import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createModerationCommands } from './commands.js';
import type { BotServices } from '../../services.js';

type Opts = Record<string, unknown>;

function makeCtx(opts: Opts = {}, extra: Record<string, unknown> = {}) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const targetUser = 'user' in opts ? opts.user : { id: 'target-1', tag: 'Target#0001' };
  const ctx: any = {
    guild: {
      id: 'guild-1',
      name: 'Test Server',
      members: {
        fetch: vi.fn().mockResolvedValue({ id: 'target-1', user: { tag: 'Target#0001' } }),
      },
    },
    channel: { id: 'chan-1' },
    user: { id: 'mod-1' },
    member: { id: 'mod-1' },
    options: {
      getUser: vi.fn().mockResolvedValue(targetUser),
      getString: vi.fn((key: string) => (opts[key] as string | undefined) ?? null),
      getInteger: vi.fn((key: string) => (opts[key] as number | undefined) ?? null),
      getBoolean: vi.fn((key: string) => (opts[key] as boolean | undefined) ?? null),
      getChannel: vi.fn().mockResolvedValue(opts.channel ?? null),
    },
    reply,
    ...extra,
  };
  return { ctx, reply };
}

function embedOf(reply: ReturnType<typeof vi.fn>) {
  return reply.mock.calls[0]![0].embeds[0].toJSON();
}

function fieldValue(embed: { fields?: Array<{ name: string; value: string }> }, name: string) {
  return embed.fields?.find((f) => f.name === name)?.value;
}

describe('moderation commands - flows and refusals (TASK-1254)', () => {
  let services: any;
  let commands: ReturnType<typeof createModerationCommands>;
  const cmd = (name: string) => commands.find((c) => c.metadata.name === name)!;

  beforeEach(() => {
    services = {
      warningEscalationService: {
        issueWarning: vi.fn().mockResolvedValue({
          success: true,
          caseNumber: 7,
          totalActiveWarnings: 3,
          cumulativeScore: 4,
          dmSent: false,
        }),
      },
      moderationActionService: {
        timeout: vi.fn().mockResolvedValue({ success: true, caseNumber: 8 }),
        untimeout: vi.fn().mockResolvedValue({ success: true }),
        kick: vi.fn().mockResolvedValue({ success: true, caseNumber: 9 }),
        softban: vi.fn().mockResolvedValue({ success: true, caseNumber: 10 }),
        ban: vi.fn().mockResolvedValue({ success: true, caseNumber: 11 }),
        unban: vi.fn().mockResolvedValue({ success: true }),
        lockChannel: vi.fn().mockResolvedValue({ success: true }),
        unlockChannel: vi.fn().mockResolvedValue({ success: true }),
        setNickname: vi.fn().mockResolvedValue({ success: true }),
      },
      purgeService: {
        purgeMessages: vi
          .fn()
          .mockResolvedValue({ success: true, deletedCount: 1, skippedOlderThan14Days: 0 }),
      },
      disciplinaryHistoryService: {
        getSummary: vi.fn().mockResolvedValue({ cases: [] }),
        buildHistoryEmbed: vi.fn().mockReturnValue({ title: 'History' }),
        addNote: vi.fn().mockResolvedValue({ content: 'trimmed note' }),
      },
      moderationRepo: {
        getNotesByUser: vi.fn().mockResolvedValue([]),
        upsertRule: vi.fn().mockResolvedValue({}),
        getRuleByType: vi.fn().mockResolvedValue(null),
      },
      autoModService: {
        getGuildRuleConfigs: vi.fn().mockResolvedValue(new Map()),
        invalidateRuleCache: vi.fn(),
        getDefaultConfig: vi.fn().mockReturnValue({ action: 'DELETE' }),
      },
      antiRaidService: {
        getConfig: vi.fn().mockReturnValue({
          enabled: false,
          joinThreshold: 5,
          windowSeconds: 30,
          freshAccountAgeHours: 12,
        }),
        getState: vi.fn().mockReturnValue({ status: 'RAID' }),
      },
    };
    commands = createModerationCommands(services as BotServices);
  });

  describe.each([
    ['warn', { reason: 'spam' }],
    ['timeout', { duration: '5m' }],
    ['untimeout', {}],
    ['kick', {}],
    ['softban', {}],
    ['ban', {}],
    ['nick', {}],
    ['history', {}],
    ['note', { action: 'view' }],
  ])('%s guards', (name, opts) => {
    it('refuses to run outside a server', async () => {
      const { ctx, reply } = makeCtx(opts, { guild: null });
      await cmd(name).execute(ctx);
      expect(reply).toHaveBeenCalledWith({
        content: '❌ This command can only be used within a server.',
      });
    });

    it('reports a target that Discord could not resolve', async () => {
      const { ctx, reply } = makeCtx({ ...opts, user: null });
      await cmd(name).execute(ctx);
      expect(reply).toHaveBeenCalledWith({ content: '❌ Target member was not found.' });
    });
  });

  describe.each([
    ['warn', { reason: 'spam' }, '❌ Target user is not a member of this server.'],
    ['timeout', { duration: '5m' }, '❌ Target member was not found in this server.'],
    ['untimeout', {}, '❌ Target member was not found in this server.'],
    ['kick', {}, '❌ Target member was not found in this server.'],
    ['softban', {}, '❌ Target member was not found in this server.'],
    ['nick', { nickname: 'x' }, '❌ Target member was not found in this server.'],
  ])('%s with a user who left the server', (name, opts, message) => {
    it('does not call the moderation service', async () => {
      const { ctx, reply } = makeCtx(opts);
      ctx.guild.members.fetch.mockRejectedValue(new Error('Unknown Member'));
      await cmd(name).execute(ctx);
      expect(reply).toHaveBeenCalledWith({ content: message });
      expect(services.warningEscalationService.issueWarning).not.toHaveBeenCalled();
      for (const fn of Object.values(services.moderationActionService)) {
        expect(fn).not.toHaveBeenCalled();
      }
    });
  });

  describe('service failures are surfaced to the moderator', () => {
    it.each([
      ['warn', 'warningEscalationService', 'issueWarning', { reason: 'r' }, 'Warning failed'],
      ['timeout', 'moderationActionService', 'timeout', { duration: '1h' }, 'Timeout failed'],
      ['untimeout', 'moderationActionService', 'untimeout', {}, 'Untimeout failed'],
      ['kick', 'moderationActionService', 'kick', {}, 'Kick failed'],
      ['softban', 'moderationActionService', 'softban', {}, 'Softban failed'],
      ['ban', 'moderationActionService', 'ban', {}, 'Ban failed'],
      ['unban', 'moderationActionService', 'unban', { user_id: '123' }, 'Unban failed'],
      ['lock', 'moderationActionService', 'lockChannel', {}, 'Lock failed'],
      ['unlock', 'moderationActionService', 'unlockChannel', {}, 'Unlock failed'],
      ['nick', 'moderationActionService', 'setNickname', {}, 'Nickname change failed'],
    ])('%s', async (name, service, method, opts, label) => {
      services[service][method].mockResolvedValue({ success: false, error: 'Missing permissions' });
      const { ctx, reply } = makeCtx(opts as Opts);
      await cmd(name).execute(ctx);
      expect(reply).toHaveBeenCalledWith({ content: `❌ ${label}: Missing permissions` });
    });

    it('falls back to "Unknown error" when the service gives no reason', async () => {
      services.moderationActionService.kick.mockResolvedValue({ success: false });
      const { ctx, reply } = makeCtx();
      await cmd('kick').execute(ctx);
      expect(reply).toHaveBeenCalledWith({ content: '❌ Kick failed: Unknown error' });
    });
  });

  describe('warn', () => {
    it('shows the escalation step with its duration, and DM failure', async () => {
      services.warningEscalationService.issueWarning.mockResolvedValue({
        success: true,
        caseNumber: 21,
        totalActiveWarnings: 5,
        cumulativeScore: 9,
        dmSent: false,
        escalationTriggered: { action: 'TIMEOUT', durationSeconds: 7200 },
      });
      const { ctx, reply } = makeCtx({ reason: 'again', severity: 3, send_dm: false });
      await cmd('warn').execute(ctx);

      expect(services.warningEscalationService.issueWarning).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'again', severity: 3, sendDm: false }),
      );
      const embed = embedOf(reply);
      expect(embed.title).toBe('⚠️ Warning Issued — Case #21');
      expect(fieldValue(embed, 'Severity')).toBe('3');
      expect(fieldValue(embed, 'DM Notification')).toBe('⚠️ Blocked / Failed');
      expect(fieldValue(embed, '🚨 Automatic Escalation Triggered!')).toContain(
        '**TIMEOUT** (2 hours)',
      );
    });

    it('names an escalation without a duration plainly', async () => {
      services.warningEscalationService.issueWarning.mockResolvedValue({
        success: true,
        totalActiveWarnings: 1,
        cumulativeScore: 1,
        dmSent: true,
        escalationTriggered: { action: 'BAN' },
      });
      const { ctx, reply } = makeCtx({ reason: 'x' });
      await cmd('warn').execute(ctx);
      const embed = embedOf(reply);
      expect(embed.title).toBe('⚠️ Warning Issued — Case #?');
      expect(fieldValue(embed, '🚨 Automatic Escalation Triggered!')).toBe(
        'Infraction threshold reached step: **BAN**',
      );
      expect(fieldValue(embed, 'DM Notification')).toBe('✅ Delivered');
    });
  });

  describe('timeout', () => {
    it.each(['abc', '0', '29d', '5w'])('rejects the duration "%s"', async (duration) => {
      const { ctx, reply } = makeCtx({ duration });
      await cmd('timeout').execute(ctx);
      expect(reply).toHaveBeenCalledWith({
        content:
          '❌ Invalid duration. Must be between 1 second and 28 days (e.g. `10m`, `1h`, `1d`).',
      });
      expect(services.moderationActionService.timeout).not.toHaveBeenCalled();
    });

    it('accepts the 28 day maximum', async () => {
      const { ctx, reply } = makeCtx({ duration: '28d' });
      await cmd('timeout').execute(ctx);
      expect(services.moderationActionService.timeout).toHaveBeenCalledWith(
        expect.objectContaining({ durationSeconds: 28 * 86400, reason: 'No reason provided' }),
      );
      expect(fieldValue(embedOf(reply), 'Duration')).toBe('28 days');
    });
  });

  describe('untimeout', () => {
    it('lifts the timeout and quotes the default reason', async () => {
      const { ctx, reply } = makeCtx();
      await cmd('untimeout').execute(ctx);
      expect(services.moderationActionService.untimeout).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Timeout removed by moderator' }),
      );
      expect(reply).toHaveBeenCalledWith({
        content:
          '✅ Successfully lifted timeout for <@target-1>. Reason: *Timeout removed by moderator*',
      });
    });
  });

  describe('kick', () => {
    it('kicks, honours send_dm and replies with the case embed', async () => {
      const { ctx, reply } = makeCtx({ reason: 'rude', send_dm: false });
      await cmd('kick').execute(ctx);
      expect(services.moderationActionService.kick).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'rude', sendDm: false }),
      );
      const embed = embedOf(reply);
      expect(embed.title).toBe('👢 Member Kicked — Case #9');
      expect(fieldValue(embed, 'Reason')).toBe('rude');
      expect(fieldValue(embed, 'Moderator')).toBe('<@mod-1>');
    });
  });

  describe('softban', () => {
    it('purges the requested days of history', async () => {
      const { ctx, reply } = makeCtx({ days: 3 });
      await cmd('softban').execute(ctx);
      expect(services.moderationActionService.softban).toHaveBeenCalledWith(
        expect.objectContaining({ deleteMessageDays: 3, sendDm: true }),
      );
      const embed = embedOf(reply);
      expect(embed.title).toBe('🔨 Member Softbanned — Case #10');
      expect(fieldValue(embed, 'Purged Message Days')).toBe('3 days');
    });

    it('defaults to one day of history', async () => {
      const { ctx } = makeCtx();
      await cmd('softban').execute(ctx);
      expect(services.moderationActionService.softban).toHaveBeenCalledWith(
        expect.objectContaining({ deleteMessageDays: 1 }),
      );
    });
  });

  describe('ban', () => {
    it('bans the resolved member and reports the deleted history', async () => {
      const { ctx, reply } = makeCtx({ days: 2, reason: 'raid' });
      await cmd('ban').execute(ctx);
      const call = services.moderationActionService.ban.mock.calls[0][0];
      expect(call.target).toMatchObject({ id: 'target-1' });
      expect(call.deleteMessageDays).toBe(2);
      const embed = embedOf(reply);
      expect(embed.title).toBe('🚫 Member Banned — Case #11');
      expect(fieldValue(embed, 'Deleted History')).toBe('2 days');
      expect(fieldValue(embed, 'Target')).toBe('<@target-1> (Target#0001)');
    });

    it('bans by user id when the user is no longer in the server', async () => {
      const { ctx } = makeCtx();
      ctx.guild.members.fetch.mockRejectedValue(new Error('Unknown Member'));
      await cmd('ban').execute(ctx);
      const call = services.moderationActionService.ban.mock.calls[0][0];
      expect(call.target).toBe('target-1');
      expect(call.deleteMessageDays).toBe(0);
    });
  });

  describe('unban', () => {
    it('unbans by id with the default reason', async () => {
      const { ctx, reply } = makeCtx({ user_id: '1234567890' });
      await cmd('unban').execute(ctx);
      expect(services.moderationActionService.unban).toHaveBeenCalledWith(
        expect.objectContaining({ targetUserId: '1234567890', reason: 'Ban revoked by staff' }),
      );
      expect(reply).toHaveBeenCalledWith({
        content: '✅ Successfully unbanned user `1234567890`. Reason: *Ban revoked by staff*',
      });
    });

    it('refuses outside a server', async () => {
      const { ctx, reply } = makeCtx({ user_id: '1' }, { guild: null });
      await cmd('unban').execute(ctx);
      expect(reply).toHaveBeenCalledWith({
        content: '❌ This command can only be used within a server.',
      });
    });
  });

  describe('purge', () => {
    it('refuses without a channel or outside a server', async () => {
      const { ctx, reply } = makeCtx({ count: 5 }, { channel: null });
      await cmd('purge').execute(ctx);
      expect(reply).toHaveBeenCalledWith({
        content: '❌ This command can only be used within a server text channel.',
      });
    });

    it.each([0, 101])('rejects a count of %i', async (count) => {
      const { ctx, reply } = makeCtx({ count });
      await cmd('purge').execute(ctx);
      expect(reply).toHaveBeenCalledWith({ content: '❌ Purge count must be between 1 and 100.' });
      expect(services.purgeService.purgeMessages).not.toHaveBeenCalled();
    });

    it('passes every filter to the purge service', async () => {
      const { ctx } = makeCtx({
        count: 50,
        invites_only: true,
        bots_only: true,
        links_only: true,
        attachments_only: true,
      });
      await cmd('purge').execute(ctx);
      expect(services.purgeService.purgeMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 50,
          filters: {
            userId: 'target-1',
            invitesOnly: true,
            botsOnly: true,
            linksOnly: true,
            attachmentsOnly: true,
          },
        }),
      );
    });

    it('uses the singular for one message and omits the 14 day note', async () => {
      const { ctx, reply } = makeCtx({ count: 1 });
      await cmd('purge').execute(ctx);
      expect(reply).toHaveBeenCalledWith({ content: '🧹 Successfully deleted **1** message.' });
    });

    it('reports a failed purge', async () => {
      services.purgeService.purgeMessages.mockResolvedValue({ success: false });
      const { ctx, reply } = makeCtx({ count: 5 });
      await cmd('purge').execute(ctx);
      expect(reply).toHaveBeenCalledWith({ content: '❌ Purge failed: Unknown error' });
    });
  });

  describe('lock and unlock', () => {
    it('lock targets the given channel with its reason', async () => {
      const { ctx, reply } = makeCtx({ channel: { id: 'chan-9' }, reason: 'raid' });
      await cmd('lock').execute(ctx);
      expect(services.moderationActionService.lockChannel).toHaveBeenCalledWith(
        expect.objectContaining({ channel: { id: 'chan-9' }, reason: 'raid' }),
      );
      expect(reply).toHaveBeenCalledWith({
        content: '🔒 **Channel Locked:** <#chan-9> is now locked for @everyone. Reason: *raid*',
      });
    });

    it('lock defaults to the current channel', async () => {
      const { ctx, reply } = makeCtx();
      await cmd('lock').execute(ctx);
      expect(reply).toHaveBeenCalledWith({
        content:
          '🔒 **Channel Locked:** <#chan-1> is now locked for @everyone. Reason: *Channel locked by staff*',
      });
    });

    it('unlock restores the current channel by default', async () => {
      const { ctx, reply } = makeCtx();
      await cmd('unlock').execute(ctx);
      expect(services.moderationActionService.unlockChannel).toHaveBeenCalledWith(
        expect.objectContaining({ channel: { id: 'chan-1' } }),
      );
      expect(reply).toHaveBeenCalledWith({
        content:
          '🔓 **Channel Unlocked:** <#chan-1> is now unlocked for @everyone. Reason: *Channel unlocked by staff*',
      });
    });

    it.each(['lock', 'unlock'])('%s refuses without a channel', async (name) => {
      const { ctx, reply } = makeCtx({}, { channel: null });
      await cmd(name).execute(ctx);
      expect(reply).toHaveBeenCalledWith({
        content: '❌ This command can only be used within a server.',
      });
    });
  });

  describe('nick', () => {
    it('changes the nickname', async () => {
      const { ctx, reply } = makeCtx({ nickname: 'Shiny' });
      await cmd('nick').execute(ctx);
      expect(services.moderationActionService.setNickname).toHaveBeenCalledWith(
        expect.objectContaining({ nickname: 'Shiny', reason: 'Nickname moderated by staff' }),
      );
      expect(reply).toHaveBeenCalledWith({
        content: "✅ Successfully changed <@target-1>'s nickname to **Shiny**.",
      });
    });

    it('resets the nickname when none is given', async () => {
      const { ctx, reply } = makeCtx();
      await cmd('nick').execute(ctx);
      expect(services.moderationActionService.setNickname).toHaveBeenCalledWith(
        expect.objectContaining({ nickname: null }),
      );
      expect(reply).toHaveBeenCalledWith({
        content: "✅ Successfully reset <@target-1>'s nickname.",
      });
    });
  });

  describe('history', () => {
    it('builds the embed from the summary for the target', async () => {
      const summary = { cases: [{ id: 1 }] };
      services.disciplinaryHistoryService.getSummary.mockResolvedValue(summary);
      const { ctx, reply } = makeCtx();
      await cmd('history').execute(ctx);
      expect(services.disciplinaryHistoryService.buildHistoryEmbed).toHaveBeenCalledWith(summary, {
        id: 'target-1',
        tag: 'Target#0001',
      });
      expect(reply).toHaveBeenCalledWith({ embeds: [{ title: 'History' }] });
    });
  });

  describe('note', () => {
    it('adds a trimmed staff note attributed to the moderator', async () => {
      const { ctx, reply } = makeCtx({ action: 'ADD', content: '  watch this one  ' });
      await cmd('note').execute(ctx);
      expect(services.disciplinaryHistoryService.addNote).toHaveBeenCalledWith(
        'guild-1',
        'target-1',
        'mod-1',
        'watch this one',
      );
      expect(reply).toHaveBeenCalledWith({
        content: '📝 Added staff note to <@target-1>: "trimmed note"',
      });
    });

    it('requires note content when adding', async () => {
      const { ctx, reply } = makeCtx({ action: 'add', content: '   ' });
      await cmd('note').execute(ctx);
      expect(reply).toHaveBeenCalledWith({ content: '❌ Please provide note content.' });
      expect(services.disciplinaryHistoryService.addNote).not.toHaveBeenCalled();
    });

    it('says when a member has no notes', async () => {
      const { ctx, reply } = makeCtx({ action: 'view' });
      await cmd('note').execute(ctx);
      expect(reply).toHaveBeenCalledWith({ content: '📝 No staff notes found for <@target-1>.' });
    });

    it('lists at most ten notes with the total', async () => {
      services.moderationRepo.getNotesByUser.mockResolvedValue(
        Array.from({ length: 12 }, (_, i) => ({
          content: `note ${i + 1}`,
          authorUserId: 'mod-1',
          createdAt: new Date(1_700_000_000_000),
        })),
      );
      const { ctx, reply } = makeCtx({ action: 'view' });
      await cmd('note').execute(ctx);
      const embed = embedOf(reply);
      expect(embed.title).toBe('📝 Staff Notes for Target#0001');
      expect(embed.description).toContain('**10.** *note 10*');
      expect(embed.description).not.toContain('note 11');
      expect(embed.description).toContain('<t:1700000000:d>');
      expect(embed.footer.text).toBe('Total notes: 12');
    });

    it('rejects an unknown action', async () => {
      const { ctx, reply } = makeCtx({ action: 'delete' });
      await cmd('note').execute(ctx);
      expect(reply).toHaveBeenCalledWith({ content: '❌ Invalid action. Choose `add` or `view`.' });
    });
  });

  describe('automod', () => {
    it('refuses outside a server', async () => {
      const { ctx, reply } = makeCtx({ action: 'status' }, { guild: null });
      await cmd('automod').execute(ctx);
      expect(reply).toHaveBeenCalledWith({
        content: '❌ This command can only be used within a server.',
      });
    });

    it('status lists each rule with its action and optional threshold plus the raid monitor', async () => {
      services.autoModService.getGuildRuleConfigs.mockResolvedValue(
        new Map([
          [
            'MENTION_SPAM',
            { ruleType: 'MENTION_SPAM', isEnabled: true, action: 'WARN', threshold: 5 },
          ],
          ['INVITE_FILTER', { ruleType: 'INVITE_FILTER', isEnabled: false, action: 'DELETE' }],
        ]),
      );
      const { ctx, reply } = makeCtx({ action: 'status' });
      await cmd('automod').execute(ctx);
      const embed = embedOf(reply);
      expect(embed.title).toBe('🛡️ Server Defensive Status — Test Server');
      const raid = fieldValue(embed, 'Anti-Raid Monitor');
      expect(raid).toContain('Enabled: ❌ No');
      expect(raid).toContain('Status: **RAID**');
      expect(raid).toContain('5 joins / 30s');
      expect(raid).toContain('< 12h');
      const rules = fieldValue(embed, 'AutoMod Rule Status');
      expect(rules).toContain('**MENTION_SPAM**: ✅ Enabled (Action: `WARN`, Threshold: 5)');
      expect(rules).toContain('**INVITE_FILTER**: ❌ Disabled (Action: `DELETE`)');
    });

    it('requires a rule to enable or disable', async () => {
      const { ctx, reply } = makeCtx({ action: 'enable' });
      await cmd('automod').execute(ctx);
      expect(reply).toHaveBeenCalledWith({ content: '❌ Please specify a rule to configure.' });
      expect(services.moderationRepo.upsertRule).not.toHaveBeenCalled();
    });

    it('keeps the stored action and threshold of an existing rule when toggling it', async () => {
      services.moderationRepo.getRuleByType.mockResolvedValue({ action: 'BAN', threshold: 9 });
      const { ctx, reply } = makeCtx({ action: 'enable', rule: 'BURST_SPAM' });
      await cmd('automod').execute(ctx);
      expect(services.moderationRepo.upsertRule).toHaveBeenCalledWith({
        guildId: 'guild-1',
        ruleType: 'BURST_SPAM',
        isEnabled: true,
      });
      expect(reply).toHaveBeenCalledWith({
        content: '🛡️ AutoMod rule **BURST_SPAM** has been **enabled** for this server.',
      });
    });

    it('creates a new rule from its defaults without a threshold when it has none', async () => {
      const { ctx } = makeCtx({ action: 'enable', rule: 'PHISHING_SHIELD' });
      await cmd('automod').execute(ctx);
      expect(services.moderationRepo.upsertRule).toHaveBeenCalledWith({
        guildId: 'guild-1',
        ruleType: 'PHISHING_SHIELD',
        isEnabled: true,
        action: 'DELETE',
      });
      expect(services.autoModService.invalidateRuleCache).toHaveBeenCalledWith('guild-1');
    });
  });
});
