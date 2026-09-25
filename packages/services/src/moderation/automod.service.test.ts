import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Guild, GuildMember } from 'discord.js';
import { EventBus, type CoreEvents } from '@ririko/core';
import {
  InviteFilterRule,
  PhishingShieldRule,
  MentionSpamRule,
  BurstSpamRule,
} from './rules/index.js';
import { AutoModService } from './automod.service.js';
import type { AutoModAction, ModerationContext } from './automod.types.js';
import type { ModerationActionService } from './moderation-action.service.js';
import type { WarningEscalationService } from './warning-escalation.service.js';

describe('AutoMod Rules & Engine Suite', () => {
  describe('InviteFilterRule', () => {
    let rule: InviteFilterRule;

    beforeEach(() => {
      rule = new InviteFilterRule();
    });

    it('should allow normal text without invite links', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Hello everyone! Welcome to the server.',
      };

      const result = await rule.evaluate(context);
      expect(result.matched).toBe(false);
      expect(result.action).toBe('ALLOW');
    });

    it('should detect discord.gg invites', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Join my awesome server discord.gg/coolserver now!',
      };

      const result = await rule.evaluate(context);
      expect(result.matched).toBe(true);
      expect(result.ruleType).toBe('INVITE_FILTER');
      expect(result.action).toBe('DELETE');
      expect(result.reason).toContain('coolserver');
    });

    it('should detect discord.com/invite links', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Check this out https://discord.com/invite/xyz12345',
      };

      const result = await rule.evaluate(context);
      expect(result.matched).toBe(true);
      expect(result.metadata?.inviteCode).toBe('xyz12345');
    });

    it('should allow whitelisted invite codes', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Join our official partner https://discord.gg/partner123',
      };

      const result = await rule.evaluate(context, {
        ruleType: 'INVITE_FILTER',
        isEnabled: true,
        action: 'DELETE',
        whitelist: ['partner123', 'ourguild'],
      });

      expect(result.matched).toBe(false);
      expect(result.action).toBe('ALLOW');
    });

    it('should trigger if at least one invite is not whitelisted', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Partner: discord.gg/partner123 and sneaky: discord.gg/evil456',
      };

      const result = await rule.evaluate(context, {
        ruleType: 'INVITE_FILTER',
        isEnabled: true,
        action: 'DELETE',
        whitelist: ['partner123'],
      });

      expect(result.matched).toBe(true);
      expect(result.metadata?.inviteCode).toBe('evil456');
    });
  });

  describe('PhishingShieldRule', () => {
    let rule: PhishingShieldRule;

    beforeEach(() => {
      rule = new PhishingShieldRule();
    });

    it('should never flag legitimate Discord domains', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content:
          'Official announcement at https://discord.com/blog and support at https://discordstatus.com',
      };

      const result = await rule.evaluate(context);
      expect(result.matched).toBe(false);
    });

    it('should never flag legitimate Steam domains', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Check my profile https://steamcommunity.com/id/gamer',
      };

      const result = await rule.evaluate(context);
      expect(result.matched).toBe(false);
    });

    it('should detect spoofed phishing domains with deceptive TLDs', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Free gifts here https://discord-nitro.gift/claim',
      };

      const result = await rule.evaluate(context);
      expect(result.matched).toBe(true);
      expect(result.ruleType).toBe('PHISHING_SHIELD');
      expect(result.reason).toContain('Suspected phishing domain');
    });

    it('should strip zero-width characters and detect disguised phishing link', async () => {
      // "discord-app.gift" with zero-width spaces (\u200B) injected between characters
      const deceptive = 'https://d\u200Biscord-app\uFEFF.gift/free';
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: `Click this: ${deceptive}`,
      };

      const result = await rule.evaluate(context);
      expect(result.matched).toBe(true);
      expect(result.metadata?.domain).toBe('discord-app.gift');
    });

    it('should normalize Cyrillic homoglyphs in phishing links', async () => {
      // Cyrillic 'а' (\u0430) and Cyrillic 'о' (\u043E)
      const deceptive = 'https://disc\u043Erd-airdr\u043Ep.gift';
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: `Free drops at ${deceptive}`,
      };

      const result = await rule.evaluate(context);
      expect(result.matched).toBe(true);
      expect(result.metadata?.domain).toBe('discord-airdrop.gift');
    });

    it('should decode leetspeak characters in domain detection', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Grab your reward https://d1sc0rd-n!tro.gift/get',
      };

      const result = await rule.evaluate(context);
      expect(result.matched).toBe(true);
    });

    it('should detect Steam phishing lookalikes', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Free skins at https://steamcommunilty.com/trade/554',
      };

      const result = await rule.evaluate(context);
      expect(result.matched).toBe(true);
      expect(result.metadata?.detectionType).toBe('STEAM_PHISH');
    });

    it('should flag custom blacklisted domains', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Check this link https://malicious-scam.xyz/steal',
      };

      const result = await rule.evaluate(context, {
        ruleType: 'PHISHING_SHIELD',
        isEnabled: true,
        action: 'DELETE',
        blacklist: ['malicious-scam.xyz'],
      });

      expect(result.matched).toBe(true);
      expect(result.metadata?.detectionType).toBe('BLACKLIST');
    });

    it('should detect scam phrase combined with external link', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Get free nitro for 3 months at https://superbonus.org/gift',
      };

      const result = await rule.evaluate(context);
      expect(result.matched).toBe(true);
      expect(result.metadata?.detectionType).toBe('SCAM_PHRASE_WITH_LINK');
    });
  });

  describe('MentionSpamRule', () => {
    let rule: MentionSpamRule;

    beforeEach(() => {
      rule = new MentionSpamRule();
    });

    it('should allow messages below mention threshold', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Hey <@11111111> and <@22222222>!',
      };

      const result = await rule.evaluate(context, {
        ruleType: 'MENTION_SPAM',
        isEnabled: true,
        action: 'DELETE',
        threshold: 5,
      });

      expect(result.matched).toBe(false);
      expect(result.action).toBe('ALLOW');
    });

    it('should trigger when mention count exceeds threshold', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content:
          '<@111> <@222> <@333> <@&444> <@555> <@666> wake up!',
      };

      const result = await rule.evaluate(context, {
        ruleType: 'MENTION_SPAM',
        isEnabled: true,
        action: 'DELETE',
        threshold: 5,
      });

      expect(result.matched).toBe(true);
      expect(result.ruleType).toBe('MENTION_SPAM');
      expect(result.metadata?.totalMentions).toBe(6);
    });

    it('should include @everyone and @here in mention calculation', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: '<@111> <@222> @everyone @here alert',
      };

      const result = await rule.evaluate(context, {
        ruleType: 'MENTION_SPAM',
        isEnabled: true,
        action: 'TIMEOUT',
        threshold: 3,
      });

      expect(result.matched).toBe(true);
      expect(result.action).toBe('TIMEOUT');
      expect(result.metadata?.totalMentions).toBe(4);
    });

    it('should respect pre-parsed context mentions', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Check this',
        mentions: {
          users: 4,
          roles: 2,
          everyone: false,
        },
      };

      const result = await rule.evaluate(context, {
        ruleType: 'MENTION_SPAM',
        isEnabled: true,
        action: 'DELETE',
        threshold: 5,
      });

      expect(result.matched).toBe(true);
      expect(result.metadata?.totalMentions).toBe(6);
    });
  });

  describe('BurstSpamRule', () => {
    let rule: BurstSpamRule;

    beforeEach(() => {
      rule = new BurstSpamRule();
      rule.reset();
    });

    it('should allow normal single messages', async () => {
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'Just a regular message.',
        createdTimestamp: 10000,
      };

      const result = await rule.evaluate(context);
      expect(result.matched).toBe(false);
    });

    it('should trigger when message velocity exceeds threshold', async () => {
      const baseTime = 20000;
      const guildId = 'guild-1';
      const userId = 'spammer-1';

      // Send 5 messages within 1.5 seconds (threshold is 5)
      for (let i = 0; i < 5; i++) {
        const res = await rule.evaluate({
          guildId,
          channelId: 'chan-1',
          userId,
          content: `Message ${i}`,
          createdTimestamp: baseTime + i * 200,
        });
        expect(res.matched).toBe(false);
      }

      // 6th message should trigger velocity violation
      const sixth = await rule.evaluate({
        guildId,
        channelId: 'chan-1',
        userId,
        content: 'Message 5 (burst overflow)',
        createdTimestamp: baseTime + 1200,
      });

      expect(sixth.matched).toBe(true);
      expect(sixth.metadata?.detectionType).toBe('BURST_VELOCITY');
    });

    it('should trigger on repeated duplicate messages', async () => {
      const baseTime = 30000;
      const guildId = 'guild-1';
      const userId = 'repeater-1';
      const repeatedContent = 'COPY PASTE SPAM';

      // 1st duplicate
      await rule.evaluate({
        guildId,
        channelId: 'chan-1',
        userId,
        content: repeatedContent,
        createdTimestamp: baseTime,
      });

      // 2nd duplicate
      await rule.evaluate({
        guildId,
        channelId: 'chan-1',
        userId,
        content: repeatedContent,
        createdTimestamp: baseTime + 2000,
      });

      // 3rd duplicate triggers duplicate spam
      const third = await rule.evaluate({
        guildId,
        channelId: 'chan-1',
        userId,
        content: repeatedContent,
        createdTimestamp: baseTime + 4000,
      });

      expect(third.matched).toBe(true);
      expect(third.metadata?.detectionType).toBe('DUPLICATE_SPAM');
    });

    it('should track different users independently', async () => {
      const baseTime = 40000;

      // User 1 sends 3 messages
      for (let i = 0; i < 3; i++) {
        await rule.evaluate({
          guildId: 'guild-1',
          channelId: 'chan-1',
          userId: 'user-A',
          content: `A-${i}`,
          createdTimestamp: baseTime + i * 100,
        });
      }

      // User 2 sends 3 messages
      for (let i = 0; i < 3; i++) {
        const res = await rule.evaluate({
          guildId: 'guild-1',
          channelId: 'chan-1',
          userId: 'user-B',
          content: `B-${i}`,
          createdTimestamp: baseTime + i * 100,
        });
        expect(res.matched).toBe(false);
      }
    });

    it('should clean up stale entries on cleanup()', () => {
      const now = 100000;
      rule.evaluate({
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'old-user',
        content: 'old',
        createdTimestamp: now - 70000, // 70s ago
      });

      rule.cleanup(now);
      // History should be cleaned without exceptions
      expect(() => rule.reset('guild-1')).not.toThrow();
    });
  });

  describe('AutoModService Pipeline', () => {
    let service: AutoModService;
    let eventBus: EventBus<CoreEvents>;

    beforeEach(() => {
      eventBus = new EventBus<CoreEvents>();
      service = new AutoModService(undefined, undefined, undefined, eventBus);
    });

    it('should bypass bots from moderation', async () => {
      const deleteFn = vi.fn().mockResolvedValue({});
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'bot-123',
        content: 'discord.gg/invitelink',
        isBot: true,
        rawMessage: { delete: deleteFn },
      };

      const result = await service.processMessage(context);
      expect(result.matched).toBe(false);
      expect(deleteFn).not.toHaveBeenCalled();
    });

    it('should bypass guild owner', async () => {
      const deleteFn = vi.fn().mockResolvedValue({});
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'owner-1',
        content: 'discord.gg/invitelink',
        isOwner: true,
        rawMessage: { delete: deleteFn },
      };

      const result = await service.processMessage(context);
      expect(result.matched).toBe(false);
      expect(deleteFn).not.toHaveBeenCalled();
    });

    it('should bypass members with Administrator or ManageGuild permissions', async () => {
      const deleteFn = vi.fn().mockResolvedValue({});
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'admin-1',
        content: 'discord.gg/invitelink',
        memberPermissions: ['Administrator'],
        rawMessage: { delete: deleteFn },
      };

      const result = await service.processMessage(context);
      expect(result.matched).toBe(false);
      expect(deleteFn).not.toHaveBeenCalled();
    });

    it('should bypass exempt channels', async () => {
      const guildId = 'guild-1';
      const channelId = 'advertisement-channel';
      service.setRuleConfig(guildId, {
        ruleType: 'INVITE_FILTER',
        isEnabled: true,
        action: 'DELETE',
        exemptChannels: [channelId],
      });

      const context: ModerationContext = {
        guildId,
        channelId,
        userId: 'user-1',
        content: 'discord.gg/coolserver',
      };

      const result = await service.processMessage(context);
      expect(result.matched).toBe(false);
    });

    it('should bypass exempt roles', async () => {
      const guildId = 'guild-1';
      const roleId = 'vip-role';
      service.setRuleConfig(guildId, {
        ruleType: 'INVITE_FILTER',
        isEnabled: true,
        action: 'DELETE',
        exemptRoles: [roleId],
      });

      const context: ModerationContext = {
        guildId,
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'discord.gg/coolserver',
        memberRoles: [roleId, 'other-role'],
      };

      const result = await service.processMessage(context);
      expect(result.matched).toBe(false);
    });

    it('should skip disabled rules', async () => {
      const guildId = 'guild-1';
      service.setRuleConfig(guildId, {
        ruleType: 'INVITE_FILTER',
        isEnabled: false,
        action: 'DELETE',
      });

      const context: ModerationContext = {
        guildId,
        channelId: 'chan-1',
        userId: 'user-1',
        content: 'discord.gg/coolserver',
      };

      const result = await service.processMessage(context);
      expect(result.matched).toBe(false);
    });

    it('should delete message and emit event on violation', async () => {
      const deleteFn = vi.fn().mockResolvedValue({});
      const listener = vi.fn();
      eventBus.on('moderation:automodViolation', listener);

      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'violator-1',
        messageId: 'msg-999',
        content: 'Free gifts at https://discord-nitro.gift/claim',
        rawMessage: { delete: deleteFn },
      };

      const result = await service.processMessage(context);
      expect(result.matched).toBe(true);
      expect(result.deleted).toBe(true);
      expect(result.ruleType).toBe('PHISHING_SHIELD');
      expect(deleteFn).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-1',
          channelId: 'chan-1',
          userId: 'violator-1',
          ruleType: 'PHISHING_SHIELD',
          action: 'DELETE',
          messageId: 'msg-999',
        }),
      );
    });

    it('should prioritize phishing shield over invite filter', async () => {
      // Both phishing domain and invite link in same message
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'attacker-1',
        content:
          'Join discord.gg/spammer and claim free gift https://discord-nitro.gift/claim',
      };

      const result = await service.evaluate(context);
      expect(result).not.toBeNull();
      expect(result?.ruleType).toBe('PHISHING_SHIELD');
    });

    it('should handle rawMessage.delete() failure gracefully', async () => {
      const deleteFn = vi.fn().mockRejectedValue(new Error('Unknown Message'));
      const context: ModerationContext = {
        guildId: 'guild-1',
        channelId: 'chan-1',
        userId: 'violator-1',
        content: 'discord.gg/badinvite',
        rawMessage: { delete: deleteFn },
      };

      const result = await service.processMessage(context);
      expect(result.matched).toBe(true);
      expect(result.deleted).toBe(false);
      expect(result.error).toContain('Unknown Message');
    });
  });

  describe('AutoModService punishments (TASK-1142)', () => {
    const bot = { id: 'bot-1' } as unknown as GuildMember;
    const member = { id: 'violator-1' } as unknown as GuildMember;
    const guild = { id: 'guild-1', members: { me: bot } } as unknown as Guild;
    let actions: { timeout: Mock; kick: Mock; ban: Mock };
    let escalation: { issueWarning: Mock };
    let service: AutoModService;

    const inviteContext = (): ModerationContext => ({
      guildId: 'guild-1',
      channelId: 'chan-1',
      userId: 'violator-1',
      content: 'join discord.gg/elsewhere',
      rawMessage: { delete: vi.fn().mockResolvedValue({}) },
      guild,
      member,
    });

    beforeEach(() => {
      actions = {
        timeout: vi.fn().mockResolvedValue({ success: true }),
        kick: vi.fn().mockResolvedValue({ success: true }),
        ban: vi.fn().mockResolvedValue({ success: false, error: 'Missing Ban Members' }),
      };
      escalation = { issueWarning: vi.fn().mockResolvedValue({ success: true }) };
      service = new AutoModService(
        undefined,
        actions as unknown as ModerationActionService,
        escalation as unknown as WarningEscalationService,
      );
    });

    const withAction = (action: AutoModAction) =>
      service.setRuleConfig('guild-1', { ruleType: 'INVITE_FILTER', isEnabled: true, action });

    it('warns through the escalation policy with the bot as the acting member', async () => {
      withAction('WARN');
      const result = await service.processMessage(inviteContext());
      expect(result).toMatchObject({ deleted: true, punished: true, actionTaken: 'WARN' });
      expect(escalation.issueWarning).toHaveBeenCalledWith({
        guild,
        invoker: bot,
        target: member,
        reason: expect.stringMatching(/^AutoMod: /),
        severity: 1,
      });
    });

    it.each([
      ['TIMEOUT', 'timeout'],
      ['KICK', 'kick'],
      ['BAN', 'ban'],
    ] as const)('runs %s through ModerationActionService', async (action, method) => {
      withAction(action);
      const result = await service.processMessage(inviteContext());
      expect(actions[method]).toHaveBeenCalledWith(
        expect.objectContaining({ guild, invoker: bot, target: member }),
      );
      if (action === 'TIMEOUT') {
        expect(actions.timeout.mock.calls[0]?.[0]).toMatchObject({ durationSeconds: 600 });
      }
      expect(result.punished).toBe(action !== 'BAN');
      if (action === 'BAN') expect(result.error).toBe('Missing Ban Members');
    });

    it('only deletes for DELETE, and reports when there is no member to punish', async () => {
      withAction('DELETE');
      expect(await service.processMessage(inviteContext())).toMatchObject({
        deleted: true,
        punished: false,
      });
      expect(actions.timeout).not.toHaveBeenCalled();
      expect(escalation.issueWarning).not.toHaveBeenCalled();

      withAction('KICK');
      const { guild: _guild, member: _member, ...withoutMember } = inviteContext();
      const result = await service.processMessage(withoutMember);
      expect(result).toMatchObject({ deleted: true, punished: false });
      expect(result.error).toContain('No guild member');
      expect(actions.kick).not.toHaveBeenCalled();
    });
  });
});
