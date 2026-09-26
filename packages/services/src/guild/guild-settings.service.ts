import { PrefixSchema, TimezoneSchema, ValidationError } from '@ririko/core';
import type { GuildSettingsRepository, GuildSettings } from '@ririko/database';
import type { z } from 'zod';

export interface CachedGuildSettings {
  prefix: string;
  timezone: string;
  locale: string;
  /** Level-up messages are posted; they also need the member's own opt-in. */
  levelUpAnnouncements: boolean;
  /** Channel for level-up messages; null posts where the member levelled up. */
  levelUpChannelId: string | null;
  /** XP rate in percent; 100 is normal. */
  xpRatePercent: number;
  noXpChannelIds: string[];
  noXpRoleIds: string[];
  voiceXpEnabled: boolean;
  cachedAt: number;
}

export interface GuildSettingsServiceOptions {
  repo: GuildSettingsRepository;
  cacheTtlMs?: number;
  defaultPrefix?: string;
  defaultTimezone?: string;
}

export class GuildSettingsService {
  private readonly repo: GuildSettingsRepository;
  private readonly cacheTtlMs: number;
  private readonly defaultPrefix: string;
  private readonly defaultTimezone: string;
  private readonly cache = new Map<string, CachedGuildSettings>();

  constructor(options: GuildSettingsServiceOptions) {
    this.repo = options.repo;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000; // 5 minutes default
    this.defaultPrefix = options.defaultPrefix ?? '!';
    this.defaultTimezone = options.defaultTimezone ?? 'UTC';
  }

  /**
   * Retrieves guild settings from in-memory cache or DB.
   * Never throws on missing rows; falls back to defaults.
   */
  async getSettings(guildId: string): Promise<CachedGuildSettings> {
    const cached = this.cache.get(guildId);
    const now = Date.now();
    if (cached && now - cached.cachedAt < this.cacheTtlMs) {
      return cached;
    }

    const row = await this.repo.findById(guildId).catch(() => null);
    const settings = this.toCached(row, now);
    this.cache.set(guildId, settings);
    return settings;
  }

  private toCached(row: Partial<GuildSettings> | null, now = Date.now()): CachedGuildSettings {
    return {
      prefix: row?.prefix || this.defaultPrefix,
      timezone: row?.timezone || this.defaultTimezone,
      locale: row?.locale || 'en-US',
      levelUpAnnouncements: row?.karmaNotificationsEnabled ?? true,
      levelUpChannelId: row?.levelUpChannelId ?? null,
      xpRatePercent: row?.xpRatePercent ?? 100,
      noXpChannelIds: row?.noXpChannelIds ?? [],
      noXpRoleIds: row?.noXpRoleIds ?? [],
      voiceXpEnabled: row?.voiceXpEnabled ?? false,
      cachedAt: now,
    };
  }

  /**
   * Fast in-memory lookup for command prefix resolution.
   */
  async getPrefix(guildId: string, fallback?: string): Promise<string> {
    const settings = await this.getSettings(guildId);
    return settings.prefix || fallback || this.defaultPrefix;
  }

  /**
   * Fast in-memory lookup for timezone resolution.
   */
  async getTimezone(guildId: string, fallback?: string): Promise<string> {
    const settings = await this.getSettings(guildId);
    return settings.timezone || fallback || this.defaultTimezone;
  }

  /**
   * Validates and sets the command prefix for a guild.
   */
  async setPrefix(guildId: string, rawPrefix: string): Promise<GuildSettings> {
    const prefix = parseSetting(PrefixSchema, rawPrefix);

    const updated = await this.repo.upsert({
      guildId,
      prefix,
    });

    this.cache.set(guildId, this.toCached(updated));

    return updated;
  }

  /**
   * Validates and sets the server timezone for a guild.
   */
  async setTimezone(guildId: string, rawTimezone: string): Promise<GuildSettings> {
    const canonical = parseSetting(TimezoneSchema, rawTimezone);

    const updated = await this.repo.upsert({
      guildId,
      timezone: canonical,
    });

    this.cache.set(guildId, this.toCached(updated));

    return updated;
  }

  /**
   * Evicts a guild from in-memory cache.
   */
  invalidate(guildId: string): void {
    this.cache.delete(guildId);
  }

  /**
   * Clears the entire in-memory cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/** Validates one setting with its shared schema; the first issue becomes the user message. */
function parseSetting<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  raw: string,
): z.output<TSchema> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Invalid value.';
    throw new ValidationError(message, { userMessage: message });
  }
  return result.data;
}
