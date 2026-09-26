import { resolveCommandOverride, type CommandOverride } from '@ririko/core';
import type { CommandSettingsRepository } from '@ririko/database';
import { toCommandOverrides } from './guild-config.service.js';

export interface CommandOverrideServiceOptions {
  repo: CommandSettingsRepository;
  cacheTtlMs?: number;
  now?: () => number;
}

/**
 * The bot's read side of command overrides. Each guild's rows are cached; the bot drops a
 * guild on `guild:configChanged` for the `commands` module, and the TTL is only a safety net.
 * Read errors propagate so a database fault never lifts a restriction.
 */
export class CommandOverrideService {
  private readonly repo: CommandSettingsRepository;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, { overrides: CommandOverride[]; cachedAt: number }>();

  constructor(options: CommandOverrideServiceOptions) {
    this.repo = options.repo;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  async list(guildId: string): Promise<CommandOverride[]> {
    const now = this.now();
    const cached = this.cache.get(guildId);
    if (cached && now - cached.cachedAt < this.cacheTtlMs) return cached.overrides;

    const overrides = toCommandOverrides(await this.repo.listForGuild(guildId));
    this.cache.set(guildId, { overrides, cachedAt: now });
    return overrides;
  }

  /** The override for `command` in `channelId` (a thread's parent channel), or null. */
  async resolve(
    guildId: string,
    channelId: string | null,
    command: string,
  ): Promise<CommandOverride | null> {
    return resolveCommandOverride(await this.list(guildId), command, channelId);
  }

  invalidate(guildId?: string): void {
    if (guildId) this.cache.delete(guildId);
    else this.cache.clear();
  }
}
