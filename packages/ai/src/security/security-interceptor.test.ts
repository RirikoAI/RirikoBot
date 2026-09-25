import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../tools/registry.js';
import { ToolSecurityInterceptor, PROHIBITED_PATTERNS } from './security-interceptor.js';
import { MediatedToolExecutor } from './mediated-executor.js';
import type { SecurityExecutionContext } from './types.js';
import type { ToolCall } from '../types/index.js';

describe('ToolSecurityInterceptor & Application Mediation (TASK-0622)', () => {
  let registry: ToolRegistry;
  let interceptor: ToolSecurityInterceptor;
  let executor: MediatedToolExecutor;

  // Discord Voice CONNECT | SPEAK permissions
  const VOICE_PERMISSIONS = 3145728n;

  beforeEach(() => {
    registry = ToolRegistry.createDefault();
    interceptor = new ToolSecurityInterceptor(registry);
    executor = new MediatedToolExecutor(registry, interceptor);
  });

  describe('1. Prohibited Pattern Firewall', () => {
    it.each([
      'exec',
      'execute',
      'spawn',
      'eval',
      'cmd',
      'powershell',
      'bash',
      'sh',
      'shell.run',
      'fs.readFile',
      'file.delete',
      'sql.select',
      'db.drop',
      'database.mutate',
      'admin.kick',
      'system.exit',
    ])('strictly blocks prohibited command or subsystem call "%s"', (badName) => {
      const verdict = interceptor.evaluate({
        toolName: badName,
        args: {},
        context: { userId: 'user-1' },
      });

      expect(verdict.allowed).toBe(false);
      if (!verdict.allowed) {
        expect(verdict.reason).toBe('PROHIBITED_TOOL');
        expect(verdict.message).toContain('violates security policies');
      }
    });

    it('matches prohibited patterns regexes directly', () => {
      expect(PROHIBITED_PATTERNS.some((p) => p.test('eval'))).toBe(true);
      expect(PROHIBITED_PATTERNS.some((p) => p.test('bash'))).toBe(true);
      expect(PROHIBITED_PATTERNS.some((p) => p.test('get_current_time'))).toBe(false);
    });
  });

  describe('2. Safe Allowlist Registration', () => {
    it('blocks arbitrary unregistered tools', () => {
      const verdict = interceptor.evaluate({
        toolName: 'unregistered.random_hack',
        args: {},
        context: { userId: 'user-1' },
      });

      expect(verdict.allowed).toBe(false);
      if (!verdict.allowed) {
        expect(verdict.reason).toBe('PROHIBITED_TOOL');
        expect(verdict.message).toContain('not registered');
      }
    });

    it('permits registered safe tools', () => {
      const verdict = interceptor.evaluate({
        toolName: 'get_current_time',
        args: {},
        context: { userId: 'user-1' },
      });

      expect(verdict.allowed).toBe(true);
    });
  });

  describe('3. Guild Allowed Tools Filter', () => {
    it('blocks tools not present in guild allowedTools list', () => {
      const context: SecurityExecutionContext = {
        userId: 'user-1',
        guildId: 'guild-1',
        allowedTools: ['get_current_time', 'anime.search'],
      };

      const coinflipVerdict = interceptor.evaluate({
        toolName: 'games.coinflip',
        args: {},
        context,
      });

      expect(coinflipVerdict.allowed).toBe(false);
      if (!coinflipVerdict.allowed) {
        expect(coinflipVerdict.reason).toBe('GUILD_TOOL_DISABLED');
        expect(coinflipVerdict.message).toContain('disabled in this server');
      }

      const timeVerdict = interceptor.evaluate({
        toolName: 'get_current_time',
        args: {},
        context,
      });
      expect(timeVerdict.allowed).toBe(true);
    });
  });

  describe('4. Module Toggle State Verification', () => {
    it('blocks tools when parent module is toggled off in guild', () => {
      const isModuleEnabled = (moduleName: string) => moduleName !== 'games';

      const context: SecurityExecutionContext = {
        userId: 'user-1',
        guildId: 'guild-1',
        isModuleEnabled,
      };

      const verdict = interceptor.evaluate({
        toolName: 'games.coinflip',
        args: {},
        context,
      });

      expect(verdict.allowed).toBe(false);
      if (!verdict.allowed) {
        expect(verdict.reason).toBe('MODULE_DISABLED');
        expect(verdict.message).toContain('Module "games" is currently disabled');
      }
    });

    it('allows tools when parent module is enabled', () => {
      const isModuleEnabled = (moduleName: string) => moduleName === 'games';

      const context: SecurityExecutionContext = {
        userId: 'user-1',
        guildId: 'guild-1',
        isModuleEnabled,
      };

      const verdict = interceptor.evaluate({
        toolName: 'games.coinflip',
        args: {},
        context,
      });

      expect(verdict.allowed).toBe(true);
    });
  });

  describe('5. Caller Discord Permissions Verification', () => {
    it('blocks user without requisite permission for music.play', () => {
      const context: SecurityExecutionContext = {
        userId: 'user-1',
        guildId: 'guild-1',
        userPermissions: 0n, // No permissions
        botPermissions: VOICE_PERMISSIONS,
      };

      const verdict = interceptor.evaluate({
        toolName: 'music.play',
        args: { query: 'Song' },
        context,
      });

      expect(verdict.allowed).toBe(false);
      if (!verdict.allowed) {
        expect(verdict.reason).toBe('USER_PERMISSION_DENIED');
        expect(verdict.message).toContain('Permission Denied');
        expect(verdict.requiredPermission).toBe(VOICE_PERMISSIONS);
      }
    });

    it('permits caller with requisite permissions for music.play', () => {
      const context: SecurityExecutionContext = {
        userId: 'user-1',
        guildId: 'guild-1',
        userPermissions: VOICE_PERMISSIONS,
        botPermissions: VOICE_PERMISSIONS,
      };

      const verdict = interceptor.evaluate({
        toolName: 'music.play',
        args: { query: 'Song' },
        context,
      });

      expect(verdict.allowed).toBe(true);
    });
  });

  describe('6. Bot Discord Permissions Verification', () => {
    it('blocks tool execution when bot lacks required permissions', () => {
      const context: SecurityExecutionContext = {
        userId: 'user-1',
        guildId: 'guild-1',
        userPermissions: VOICE_PERMISSIONS,
        botPermissions: 0n, // Bot lacks voice permissions
      };

      const verdict = interceptor.evaluate({
        toolName: 'music.play',
        args: { query: 'Song' },
        context,
      });

      expect(verdict.allowed).toBe(false);
      if (!verdict.allowed) {
        expect(verdict.reason).toBe('BOT_PERMISSION_DENIED');
        expect(verdict.message).toContain('Ririko lacks the necessary Discord permissions');
      }
    });
  });

  describe('7. Role Hierarchy Verification', () => {
    it('blocks execution when user role is lower than or equal to target member', () => {
      const context: SecurityExecutionContext = {
        userId: 'user-mod',
        userHighestRolePosition: 5,
        botHighestRolePosition: 10,
        targetHighestRolePosition: 5, // Equal to user
      };

      const verdict = interceptor.evaluate({
        toolName: 'economy.check_balance',
        args: { targetUserId: 'target-1' },
        context,
      });

      expect(verdict.allowed).toBe(false);
      if (!verdict.allowed) {
        expect(verdict.reason).toBe('ROLE_HIERARCHY_VIOLATION');
        expect(verdict.message).toContain('Your role must be higher than the target member');
      }
    });

    it('blocks execution when bot role is lower than target member', () => {
      const context: SecurityExecutionContext = {
        userId: 'user-owner',
        userHighestRolePosition: 100,
        botHighestRolePosition: 3,
        targetHighestRolePosition: 5, // Higher than bot
      };

      const verdict = interceptor.evaluate({
        toolName: 'economy.check_balance',
        args: { targetUserId: 'target-1' },
        context,
      });

      expect(verdict.allowed).toBe(false);
      if (!verdict.allowed) {
        expect(verdict.reason).toBe('ROLE_HIERARCHY_VIOLATION');
        expect(verdict.message).toContain("Ririko's role must be higher");
      }
    });

    it('permits execution when user and bot are both higher than target', () => {
      const context: SecurityExecutionContext = {
        userId: 'user-mod',
        userHighestRolePosition: 10,
        botHighestRolePosition: 15,
        targetHighestRolePosition: 5,
      };

      const verdict = interceptor.evaluate({
        toolName: 'economy.check_balance',
        args: { targetUserId: 'target-1' },
        context,
      });

      expect(verdict.allowed).toBe(true);
    });
  });

  describe('8. MediatedToolExecutor (End-to-End)', () => {
    it('executes allowed tool call and returns successful response', async () => {
      const toolCall: ToolCall = {
        id: 'call-clock-1',
        name: 'get_current_time',
        arguments: { timezone: 'UTC' },
      };

      const response = await executor.executeMediated(toolCall, {
        userId: 'user-1',
        guildId: 'guild-1',
      });

      expect(response.toolCallId).toBe('call-clock-1');
      expect(response.name).toBe('get_current_time');
      expect(response.success).toBe(true);
      expect(response.result).toBeDefined();
      expect((response.result as { timezone: string })?.timezone).toBe('UTC');
    });

    it('traps denied tool call without throwing unhandled exceptions', async () => {
      const toolCall: ToolCall = {
        id: 'call-eval-1',
        name: 'eval',
        arguments: { code: 'process.exit(1)' },
      };

      const response = await executor.executeMediated(toolCall, {
        userId: 'user-attacker',
      });

      expect(response.toolCallId).toBe('call-eval-1');
      expect(response.name).toBe('eval');
      expect(response.success).toBe(false);
      expect(response.denialReason).toBe('PROHIBITED_TOOL');
      expect(response.error).toContain('violates security policies');
    });

    it('traps tool parameter validation failure without crashing', async () => {
      const toolCall: ToolCall = {
        id: 'call-anime-invalid',
        name: 'anime.search',
        arguments: { title: '' }, // empty title violates min(1) schema
      };

      const response = await executor.executeMediated(toolCall, {
        userId: 'user-1',
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Tool execution failed');
    });

    it('executes a batch of tool calls sequentially', async () => {
      const batch: ToolCall[] = [
        { id: '1', name: 'get_current_time', arguments: {} },
        { id: '2', name: 'games.coinflip', arguments: {} },
        { id: '3', name: 'exec', arguments: {} }, // Denied
      ];

      const responses = await executor.executeBatch(batch, {
        userId: 'user-1',
      });

      expect(responses).toHaveLength(3);
      expect(responses[0]?.success).toBe(true);
      expect(responses[1]?.success).toBe(true);
      expect(responses[2]?.success).toBe(false);
      expect(responses[2]?.denialReason).toBe('PROHIBITED_TOOL');
    });
  });
});
