import { AppError, publicError } from '@ririko/core';
import type { ActorContext, GuildSettings } from '@ririko/core';
import { commandAccessError } from './access.js';
import type { CommandDefinition, CommandInvocation, CommandResult, CommandSettings, ErrorResult } from './contracts.js';
import { parseArguments, parsePrefix, validateArguments } from './parser.js';
import type { CommandRegistry } from './registry.js';

function errorResult(error: unknown): ErrorResult {
  return { kind: 'error', code: error instanceof AppError ? error.code : 'INTERNAL', content: publicError(error), ephemeral: true };
}

/** No Discord objects, singleton request fields, or unawaited handlers cross this boundary. */
export class CommandDispatcher {
  private readonly registry: CommandRegistry;
  private readonly settings: CommandSettings;
  private readonly clock: () => number;
  private readonly maxCooldownEntries: number;
  private readonly cooldowns = new Map<string, number>();

  constructor(options: { registry: CommandRegistry; settings: CommandSettings; clock?: () => number; maxCooldownEntries?: number }) {
    this.registry = options.registry;
    this.settings = options.settings;
    this.clock = options.clock ?? Date.now;
    this.maxCooldownEntries = options.maxCooldownEntries ?? 10000;
    if (!Number.isSafeInteger(this.maxCooldownEntries) || this.maxCooldownEntries < 1) throw new Error('Invalid cooldown capacity.');
  }

  async dispatch(invocation: CommandInvocation): Promise<CommandResult> {
    try {
      const command = invocation.transport === 'context'
        ? (invocation.contextType ? this.registry.resolveContext(invocation.name, invocation.contextType) : undefined)
        : this.registry.resolve(invocation.name);
      if (!command) throw new AppError('NOT_FOUND', 'Command not found. Use help to see available commands.');
      const settings = invocation.actor.guildId ? await this.settings.get(invocation.actor.guildId) : null;
      return await this.execute(command, invocation, settings);
    } catch (error) {
      return errorResult(error);
    }
  }

  async dispatchPrefix(content: string, actor: ActorContext, latencyMs?: number): Promise<CommandResult | null> {
    // Preserve legacy guild-only prefix dispatch. Slash commands may explicitly support DMs.
    if (!actor.guildId) return null;
    try {
      const settings = await this.settings.get(actor.guildId);
      const tokens = parsePrefix(content, settings.prefix);
      if (!tokens) return null;
      const resolved = this.registry.resolvePrefix(tokens);
      if (!resolved) throw new AppError('NOT_FOUND', 'Command not found. Use help to see available commands.');
      const denied = commandAccessError(resolved.command, actor, settings);
      if (denied) throw denied;
      const args = parseArguments(tokens.slice(resolved.consumed), resolved.command.options ?? []);
      const invocation: CommandInvocation = { actor, transport: 'prefix', name: resolved.command.name, args, ...(latencyMs !== undefined ? { latencyMs } : {}) };
      return await this.execute(resolved.command, invocation, settings);
    } catch (error) {
      return errorResult(error);
    }
  }

  private async execute(command: CommandDefinition, invocation: CommandInvocation, settings: GuildSettings | null): Promise<CommandResult> {
    const denied = commandAccessError(command, invocation.actor, settings);
    if (denied) throw denied;
    const args = validateArguments(command.options ?? [], invocation.args);
    this.claimCooldown(command, invocation.actor);
    const actor = Object.freeze({ ...invocation.actor, roles: Object.freeze([...invocation.actor.roles]), permissions: Object.freeze([...invocation.actor.permissions]), botPermissions: Object.freeze([...invocation.actor.botPermissions]) });
    return await command.execute({ ...invocation, name: command.name, actor, args, command, settings: settings ? structuredClone(settings) : null });
  }

  private claimCooldown(command: CommandDefinition, actor: ActorContext): void {
    if (!command.cooldownMs) return;
    const now = this.clock();
    const key = JSON.stringify([command.name, actor.guildId ?? null, actor.userId]);
    const expires = this.cooldowns.get(key);
    if (expires !== undefined && expires > now) throw new AppError('COOLDOWN', `Try again in ${Math.ceil((expires - now) / 1000)} seconds.`);
    if (expires !== undefined) this.cooldowns.delete(key);
    if (this.cooldowns.size >= this.maxCooldownEntries) {
      for (const [entry, until] of this.cooldowns) if (until <= now) this.cooldowns.delete(entry);
      // Never evict an active restriction, which would allow cooldown bypass at capacity.
      if (this.cooldowns.size >= this.maxCooldownEntries) throw new AppError('BUSY', 'The bot is busy. Please try again shortly.');
    }
    this.cooldowns.set(key, now + command.cooldownMs);
  }
}
