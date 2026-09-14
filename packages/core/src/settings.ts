import { z } from 'zod';
import type { ActorContext, CommandPolicy, GuildSettings, GuildSettingsStore, ModuleDefinition } from './contracts.js';
import { AppError } from './errors.js';
import { requireGuildManager } from './permissions.js';

export const snowflakeSchema = z.string().regex(/^\d{1,20}$/, 'Expected a Discord ID.');
export const prefixSchema = z.string().min(1).max(16).refine((value) => !/\s/u.test(value) && [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127), 'Prefix cannot contain whitespace or control characters.');
const nameSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
export const commandPolicySchema = z.object({
  enabled: z.boolean().optional(),
  allowedRoleIds: z.array(snowflakeSchema).max(100).optional(),
  channels: z.record(snowflakeSchema, z.boolean()).optional(),
}).strict().transform((value): CommandPolicy => ({
  ...(value.enabled === undefined ? {} : { enabled: value.enabled }),
  ...(value.allowedRoleIds === undefined ? {} : { allowedRoleIds: value.allowedRoleIds }),
  ...(value.channels === undefined ? {} : { channels: value.channels }),
}));
export const guildSettingsSchema = z.object({
  guildId: snowflakeSchema,
  prefix: prefixSchema,
  modules: z.record(nameSchema, z.boolean()),
  commands: z.record(z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/), commandPolicySchema),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
}).strict();

/** Shared, bounded settings cache and authorization boundary for all transports. */
export class SettingsService {
  private readonly cache = new Map<string, { value: GuildSettings; expires: number }>();
  readonly modules: readonly ModuleDefinition[];

  constructor(
    private readonly store: GuildSettingsStore,
    private readonly defaultPrefix = '!',
    modules: readonly ModuleDefinition[] = [{ id: 'core', name: 'Core', description: 'Help and server configuration', defaultEnabled: true, essential: true }],
    private readonly clock: () => number = Date.now,
    private readonly cacheTtlMs = 5000,
  ) {
    prefixSchema.parse(defaultPrefix);
    const names = new Set<string>();
    for (const module of modules) {
      nameSchema.parse(module.id);
      if (names.has(module.id)) throw new Error('Duplicate module ID.');
      names.add(module.id);
    }
    this.modules = structuredClone(modules);
  }

  /** Read persistent settings, caching for at most five seconds by default. */
  async get(guildId: string): Promise<GuildSettings> {
    snowflakeSchema.parse(guildId);
    const cached = this.cache.get(guildId);
    if (cached && cached.expires > this.clock()) return structuredClone(cached.value);
    const stored = await this.store.get(guildId);
    const value = guildSettingsSchema.parse(stored ?? {
      guildId, prefix: this.defaultPrefix, modules: {}, commands: {}, revision: 0,
    });
    if (value.guildId !== guildId) throw new Error('Settings scope mismatch.');
    for (const module of this.modules) {
      if (module.essential) value.modules[module.id] = true;
      else value.modules[module.id] ??= module.defaultEnabled;
    }
    if (this.cache.size >= 10000) {
      const first = this.cache.keys().next().value;
      if (first !== undefined) this.cache.delete(first);
    }
    this.cache.set(guildId, { value, expires: this.clock() + this.cacheTtlMs });
    return structuredClone(value);
  }

  /** Persist a validated prefix without duplicating transport business logic. */
  async setPrefix(actor: ActorContext, prefix: string): Promise<GuildSettings> {
    const parsed = prefixSchema.safeParse(prefix);
    if (!parsed.success) throw new AppError('VALIDATION', 'Use a prefix of 1–16 characters without whitespace.');
    return this.update(actor, (value) => { value.prefix = parsed.data; });
  }

  /** Toggle an implemented optional module; core administration stays recoverable. */
  async setModule(actor: ActorContext, moduleId: string, enabled: boolean): Promise<GuildSettings> {
    const module = this.modules.find((entry) => entry.id === moduleId);
    if (!module) throw new AppError('NOT_FOUND', 'This module is not installed.');
    if (module.essential && !enabled) throw new AppError('VALIDATION', 'Core administration cannot be disabled.');
    return this.update(actor, (value) => { value.modules[moduleId] = enabled; });
  }

  private async update(actor: ActorContext, change: (value: GuildSettings) => void): Promise<GuildSettings> {
    const guildId = requireGuildManager(actor);
    snowflakeSchema.parse(actor.userId);
    // Fresh read avoids overwriting a CLI/dashboard change hidden by the cache.
    this.cache.delete(guildId);
    const current = await this.get(guildId);
    const expectedRevision = current.revision;
    change(current);
    try {
      return guildSettingsSchema.parse(await this.store.save(guildSettingsSchema.parse(current), expectedRevision, actor.userId));
    } finally {
      this.cache.delete(guildId);
    }
  }
}
