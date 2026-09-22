import { describe, it, expect, vi } from 'vitest';
import { PermissionsBitField } from 'discord.js';
import {
  CommandGuildOnlyError,
  CommandPermissionError,
  type CommandContext,
} from '@ririko/discord';
import { ValidationError } from '@ririko/core';
import type { BotServices } from '../../../services.js';
import { createPrefixCommand } from '../prefix.command.js';
import { createTimezoneCommand } from '../timezone.command.js';

describe('Server Settings Commands Suite', () => {
  describe('/prefix command', () => {
    function setupPrefix(options: {
      source?: 'slash' | 'prefix';
      args?: string[];
      slash?: Record<string, string>;
      hasManageGuild?: boolean;
      inGuild?: boolean;
      currentPrefix?: string;
    } = {}) {
      const currentPrefix = options.currentPrefix ?? '!';
      const guildSettingsService = {
        getPrefix: vi.fn(async () => currentPrefix),
        setPrefix: vi.fn(async (_guildId: string, prefix: string) => ({
          guildId: 'guild-1',
          prefix,
          timezone: 'UTC',
          locale: 'en-US',
        })),
      };

      const services = {
        guildSettingsService,
      } as unknown as BotServices;

      const inGuild = options.inGuild ?? true;
      const hasPerm = options.hasManageGuild ?? true;
      const slash = options.slash ?? {};

      const permissions = new PermissionsBitField();
      if (hasPerm) {
        permissions.add(PermissionsBitField.Flags.ManageGuild);
      }

      const raw = {
        source: options.source ?? 'slash',
        commandName: 'prefix',
        user: { id: 'user-1' },
        guild: inGuild ? { id: 'guild-1', name: 'Test Guild' } : null,
        member: inGuild ? { permissions } : null,
        options: {
          getString: vi.fn((name: string) => slash[name] ?? null),
          getRawArgs: vi.fn(() => options.args ?? []),
        },
        reply: vi.fn<(payload: any) => Promise<void>>(async () => undefined),
      };

      return {
        command: createPrefixCommand(services),
        ctx: raw as unknown as CommandContext,
        raw,
        services: services as unknown as { guildSettingsService: typeof guildSettingsService },
      };
    }

    it('displays the current prefix when no arguments are provided (slash)', async () => {
      const { command, ctx, raw, services } = setupPrefix({ currentPrefix: '?' });
      await command.execute(ctx);

      expect(services.guildSettingsService.getPrefix).toHaveBeenCalledWith('guild-1');
      expect(raw.reply).toHaveBeenCalled();
      const replyCall = raw.reply.mock.calls[0]![0];
      expect(replyCall.embeds[0].data.title).toContain('Prefix');
      expect(replyCall.embeds[0].data.description).toContain('?');
    });

    it('displays DM guidance when invoked in DMs without arguments', async () => {
      const { command, ctx, raw } = setupPrefix({ inGuild: false });
      await command.execute(ctx);

      expect(raw.reply).toHaveBeenCalled();
      const replyCall = raw.reply.mock.calls[0]![0];
      expect(replyCall.embeds[0].data.description).toContain('Direct Messages');
    });

    it('updates prefix when user has ManageGuild permission (slash)', async () => {
      const { command, ctx, raw, services } = setupPrefix({
        slash: { set: '$' },
        hasManageGuild: true,
      });

      await command.execute(ctx);

      expect(services.guildSettingsService.setPrefix).toHaveBeenCalledWith('guild-1', '$');
      expect(raw.reply).toHaveBeenCalled();
      const replyCall = raw.reply.mock.calls[0]![0];
      expect(replyCall.embeds[0].data.title).toContain('Updated');
      expect(replyCall.embeds[0].data.description).toContain('$');
    });

    it('updates prefix from prefix arguments (!prefix ?)', async () => {
      const { command, ctx, raw, services } = setupPrefix({
        source: 'prefix',
        args: ['?'],
        hasManageGuild: true,
      });

      await command.execute(ctx);

      expect(services.guildSettingsService.setPrefix).toHaveBeenCalledWith('guild-1', '?');
      expect(raw.reply).toHaveBeenCalled();
    });

    it('throws CommandPermissionError when member lacks ManageGuild permission', async () => {
      const { command, ctx } = setupPrefix({
        slash: { set: '$' },
        hasManageGuild: false,
      });

      await expect(command.execute(ctx)).rejects.toThrow(CommandPermissionError);
    });

    it('throws CommandGuildOnlyError when attempting to set prefix in DM', async () => {
      const { command, ctx } = setupPrefix({
        inGuild: false,
        slash: { set: '$' },
      });

      await expect(command.execute(ctx)).rejects.toThrow(CommandGuildOnlyError);
    });
  });

  describe('/timezone command', () => {
    function setupTimezone(options: {
      source?: 'slash' | 'prefix';
      args?: string[];
      slash?: Record<string, string>;
      hasManageGuild?: boolean;
      inGuild?: boolean;
      serverTz?: string;
      userTz?: string | null;
    } = {}) {
      const serverTz = options.serverTz ?? 'Asia/Kuala_Lumpur';
      const userTz = options.userTz !== undefined ? options.userTz : null;

      const guildSettingsService = {
        getTimezone: vi.fn(async () => serverTz),
        setTimezone: vi.fn(async (_guildId: string, tz: string) => ({
          guildId: 'guild-1',
          prefix: '!',
          timezone: tz,
          locale: 'en-US',
        })),
      };

      const conversationManager = {
        getUserPreferences: vi.fn(async () => (userTz ? { timezone: userTz } : {})),
        setUserPreferences: vi.fn(async () => ({})),
      };

      const services = {
        guildSettingsService,
        conversationManager,
      } as unknown as BotServices;

      const inGuild = options.inGuild ?? true;
      const hasPerm = options.hasManageGuild ?? true;
      const slash = options.slash ?? {};

      const permissions = new PermissionsBitField();
      if (hasPerm) {
        permissions.add(PermissionsBitField.Flags.ManageGuild);
      }

      const raw = {
        source: options.source ?? 'slash',
        commandName: 'timezone',
        user: { id: 'user-1' },
        guild: inGuild ? { id: 'guild-1', name: 'Test Guild' } : null,
        member: inGuild ? { permissions } : null,
        options: {
          getString: vi.fn((name: string) => slash[name] ?? null),
          getRawArgs: vi.fn(() => options.args ?? []),
        },
        reply: vi.fn<(payload: any) => Promise<void>>(async () => undefined),
      };

      return {
        command: createTimezoneCommand(services),
        ctx: raw as unknown as CommandContext,
        raw,
        services: services as unknown as {
          guildSettingsService: typeof guildSettingsService;
          conversationManager: typeof conversationManager;
        },
      };
    }

    it('views timezone hierarchy when called without arguments', async () => {
      const { command, ctx, raw, services } = setupTimezone({
        serverTz: 'Asia/Kuala_Lumpur',
        userTz: 'Europe/London',
      });

      await command.execute(ctx);

      expect(services.guildSettingsService.getTimezone).toHaveBeenCalledWith('guild-1');
      expect(services.conversationManager.getUserPreferences).toHaveBeenCalledWith('user-1');
      expect(raw.reply).toHaveBeenCalled();

      const replyCall = raw.reply.mock.calls[0]![0];
      expect(replyCall.embeds[0].data.title).toContain('Timezone');
      expect(replyCall.embeds[0].data.fields.some((f: any) => f.name.includes('Server'))).toBe(true);
      expect(replyCall.embeds[0].data.fields.some((f: any) => f.name.includes('Personal'))).toBe(true);
    });

    it('sets server timezone when requested by administrator (slash)', async () => {
      const { command, ctx, raw, services } = setupTimezone({
        slash: { set: 'Asia/Tokyo', scope: 'server' },
        hasManageGuild: true,
      });

      await command.execute(ctx);

      expect(services.guildSettingsService.setTimezone).toHaveBeenCalledWith('guild-1', 'Asia/Tokyo');
      expect(raw.reply).toHaveBeenCalled();
      const replyCall = raw.reply.mock.calls[0]![0];
      expect(replyCall.embeds[0].data.title).toContain('Server Timezone Updated');
      expect(replyCall.embeds[0].data.description).toContain('Asia/Tokyo');
    });

    it('rejects setting server timezone when member lacks ManageGuild permission', async () => {
      const { command, ctx } = setupTimezone({
        slash: { set: 'Asia/Tokyo', scope: 'server' },
        hasManageGuild: false,
      });

      await expect(command.execute(ctx)).rejects.toThrow(CommandPermissionError);
    });

    it('sets personal timezone with scope: user', async () => {
      const { command, ctx, raw, services } = setupTimezone({
        slash: { set: 'America/New_York', scope: 'user' },
        hasManageGuild: false,
      });

      await command.execute(ctx);

      expect(services.conversationManager.setUserPreferences).toHaveBeenCalledWith('user-1', {
        timezone: 'America/New_York',
      });
      expect(raw.reply).toHaveBeenCalled();
      const replyCall = raw.reply.mock.calls[0]![0];
      expect(replyCall.embeds[0].data.title).toContain('Personal Timezone Updated');
      expect(replyCall.embeds[0].data.description).toContain('America/New_York');
    });

    it('parses prefix !tz server <zone>', async () => {
      const { command, ctx, services } = setupTimezone({
        source: 'prefix',
        args: ['server', 'Europe/Paris'],
        hasManageGuild: true,
      });

      await command.execute(ctx);

      expect(services.guildSettingsService.setTimezone).toHaveBeenCalledWith('guild-1', 'Europe/Paris');
    });

    it('parses prefix !tz user <zone>', async () => {
      const { command, ctx, services } = setupTimezone({
        source: 'prefix',
        args: ['user', 'Asia/Singapore'],
        hasManageGuild: false,
      });

      await command.execute(ctx);

      expect(services.conversationManager.setUserPreferences).toHaveBeenCalledWith('user-1', {
        timezone: 'Asia/Singapore',
      });
    });

    it('gracefully sets personal timezone when non-admin runs !tz <zone>', async () => {
      const { command, ctx, services } = setupTimezone({
        source: 'prefix',
        args: ['Asia/Seoul'],
        hasManageGuild: false,
      });

      await command.execute(ctx);

      expect(services.conversationManager.setUserPreferences).toHaveBeenCalledWith('user-1', {
        timezone: 'Asia/Seoul',
      });
    });

    it('rejects invalid IANA timezone names with ValidationError', async () => {
      const { command, ctx } = setupTimezone({
        slash: { set: 'NotATimezone', scope: 'user' },
      });

      await expect(command.execute(ctx)).rejects.toThrow(ValidationError);
    });

    it('rejects GMT+8 offset without IANA region', async () => {
      const { command, ctx } = setupTimezone({
        slash: { set: 'GMT+8', scope: 'server' },
      });

      await expect(command.execute(ctx)).rejects.toThrow(ValidationError);
    });
  });
});
