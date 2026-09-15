import { describe, it, expect, vi } from 'vitest';
import { ApplicationCommandOptionType, PermissionFlagsBits, type REST } from 'discord.js';
import { CommandRegistry } from '../router/registry.js';
import { buildCommandPayload, CommandSynchronizer, mapOptionType } from './sync.js';
import { CommandCategory, type Command } from '../command/types.js';

describe('Discord REST v10 Command Synchronizer (TASK-0332)', () => {
  describe('mapOptionType', () => {
    it('correctly maps all CommandOptionType variants to Discord API numbers', () => {
      expect(mapOptionType('STRING')).toBe(ApplicationCommandOptionType.String);
      expect(mapOptionType('INTEGER')).toBe(ApplicationCommandOptionType.Integer);
      expect(mapOptionType('NUMBER')).toBe(ApplicationCommandOptionType.Number);
      expect(mapOptionType('BOOLEAN')).toBe(ApplicationCommandOptionType.Boolean);
      expect(mapOptionType('USER')).toBe(ApplicationCommandOptionType.User);
      expect(mapOptionType('CHANNEL')).toBe(ApplicationCommandOptionType.Channel);
      expect(mapOptionType('ROLE')).toBe(ApplicationCommandOptionType.Role);
      expect(mapOptionType('ATTACHMENT')).toBe(ApplicationCommandOptionType.Attachment);
    });
  });

  describe('buildCommandPayload', () => {
    it('constructs complete REST payload including permissions and options', () => {
      const cmd: Command = {
        metadata: {
          name: 'ban',
          category: CommandCategory.MODERATION,
          description: 'Ban a troublesome user from the server',
          isGuildOnly: true,
          userPermissions: [PermissionFlagsBits.BanMembers],
          options: [
            {
              name: 'target',
              type: 'USER',
              description: 'Target member to ban',
              required: true,
            },
            {
              name: 'reason',
              type: 'STRING',
              description: 'Reason for the ban',
              required: false,
              minLength: 3,
              maxLength: 200,
            },
            {
              name: 'days',
              type: 'INTEGER',
              description: 'Days of messages to delete',
              required: false,
              minValue: 0,
              maxValue: 7,
              choices: [
                { name: 'None', value: 0 },
                { name: '1 Day', value: 1 },
                { name: '7 Days', value: 7 },
              ],
            },
          ],
        },
        execute: vi.fn(),
      };

      const payload = buildCommandPayload(cmd);

      expect(payload.name).toBe('ban');
      expect(payload.description).toBe('Ban a troublesome user from the server');
      expect(payload.dm_permission).toBe(false);
      expect(payload.default_member_permissions).toBe(PermissionFlagsBits.BanMembers.toString());

      expect(payload.options).toHaveLength(3);
      const [targetOpt, reasonOpt, daysOpt] = payload.options!;

      expect(targetOpt?.name).toBe('target');
      expect(targetOpt?.type).toBe(ApplicationCommandOptionType.User);
      expect(targetOpt?.required).toBe(true);

      expect(reasonOpt?.name).toBe('reason');
      expect(reasonOpt?.type).toBe(ApplicationCommandOptionType.String);
      expect((reasonOpt as { min_length?: number }).min_length).toBe(3);
      expect((reasonOpt as { max_length?: number }).max_length).toBe(200);

      expect(daysOpt?.name).toBe('days');
      expect(daysOpt?.type).toBe(ApplicationCommandOptionType.Integer);
      expect((daysOpt as { min_value?: number }).min_value).toBe(0);
      expect((daysOpt as { max_value?: number }).max_value).toBe(7);
      expect((daysOpt as { choices?: unknown[] }).choices).toHaveLength(3);
    });
  });

  describe('CommandSynchronizer operations', () => {
    const mockPut = vi.fn().mockResolvedValue([]);
    const mockRest = {
      put: mockPut,
    } as unknown as REST;

    const registry = new CommandRegistry();

    const slashCmd: Command = {
      metadata: {
        name: 'ping',
        category: CommandCategory.GENERAL,
        description: 'Check ping',
      },
      execute: vi.fn(),
    };

    const prefixOnlyCmd: Command = {
      metadata: {
        name: 'oldcmd',
        category: CommandCategory.UTILITY,
        description: 'Prefix only',
        slashEnabled: false,
      },
      execute: vi.fn(),
    };

    registry.registerAll([slashCmd, prefixOnlyCmd]);
    const synchronizer = new CommandSynchronizer(mockRest, registry);

    it('filters out slashEnabled: false commands in payload generation', () => {
      const payloads = synchronizer.generatePayloads();
      expect(payloads).toHaveLength(1);
      expect(payloads[0]?.name).toBe('ping');
    });

    it('synchronizes commands globally via REST PUT', async () => {
      mockPut.mockClear();

      const result = await synchronizer.syncGlobal('app-12345');

      expect(result.scope).toBe('global');
      expect(result.applicationId).toBe('app-12345');
      expect(result.registeredCount).toBe(1);
      expect(result.commandNames).toEqual(['ping']);

      expect(mockPut).toHaveBeenCalledWith(
        '/applications/app-12345/commands',
        expect.objectContaining({
          body: expect.arrayContaining([expect.objectContaining({ name: 'ping' })]),
        }),
      );
    });

    it('synchronizes commands to a specific guild via REST PUT', async () => {
      mockPut.mockClear();

      const result = await synchronizer.syncGuild('app-12345', 'guild-999');

      expect(result.scope).toBe('guild');
      expect(result.applicationId).toBe('app-12345');
      expect(result.guildId).toBe('guild-999');
      expect(result.registeredCount).toBe(1);

      expect(mockPut).toHaveBeenCalledWith(
        '/applications/app-12345/guilds/guild-999/commands',
        expect.objectContaining({
          body: expect.arrayContaining([expect.objectContaining({ name: 'ping' })]),
        }),
      );
    });

    it('clears global and guild commands with empty array payloads', async () => {
      mockPut.mockClear();
      await synchronizer.clearGlobal('app-12345');
      expect(mockPut).toHaveBeenCalledWith('/applications/app-12345/commands', {
        body: [],
      });

      mockPut.mockClear();
      await synchronizer.clearGuild('app-12345', 'guild-999');
      expect(mockPut).toHaveBeenCalledWith('/applications/app-12345/guilds/guild-999/commands', {
        body: [],
      });
    });
  });
});
