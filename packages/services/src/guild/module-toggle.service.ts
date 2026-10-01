import type { EventBus } from '@ririko/core';
import type { CommandOverrideService } from './command-override.service.js';
import type { GuildSettingsService } from './guild-settings.service.js';

/**
 * Standard categories that are always enabled and exempt from server-wide module disabling.
 */
export const EXEMPT_MODULE_CATEGORIES = ['general', 'admin', 'utility'] as const;

export interface ModuleToggleServiceOptions {
  /** Optional service reading command_settings overrides. */
  commandOverrideService?: CommandOverrideService | undefined;
  /** Optional service reading guild_settings. */
  guildSettingsService?: GuildSettingsService | undefined;
  /** Event bus for cache invalidation on config changes. */
  eventBus?: EventBus | undefined;
  /** Default enablement for categories with no explicit override. Defaults to true. */
  defaultEnabled?: boolean | undefined;
}

/**
 * Evaluates and manages guild-level module/category toggles.
 * Integrates with CommandOverrideService, GuildSettingsService, and in-memory overrides.
 */
export class ModuleToggleService {
  private readonly commandOverrideService?: CommandOverrideService | undefined;
  private readonly guildSettingsService?: GuildSettingsService | undefined;
  private readonly defaultEnabled: boolean;
  private readonly explicitOverrides = new Map<string, Map<string, boolean>>();

  constructor(options: ModuleToggleServiceOptions = {}) {
    this.commandOverrideService = options.commandOverrideService;
    this.guildSettingsService = options.guildSettingsService;
    this.defaultEnabled = options.defaultEnabled ?? true;

    if (options.eventBus) {
      options.eventBus.on('guild:configChanged', ({ guildId, module }) => {
        if (module === 'commands' || module === 'general' || module === 'games') {
          this.invalidate(guildId);
        }
      });
    }
  }

  /**
   * Checks whether a feature module / command category is enabled in the specified guild.
   */
  public async isModuleEnabled(guildId: string, category: string): Promise<boolean> {
    const normalized = category.toLowerCase().trim();

    // 1. Exempt categories are always enabled
    if ((EXEMPT_MODULE_CATEGORIES as readonly string[]).includes(normalized)) {
      return true;
    }

    // 2. Explicit in-memory overrides (e.g. set via setModuleEnabled)
    const guildOverrides = this.explicitOverrides.get(guildId);
    if (guildOverrides?.has(normalized)) {
      return guildOverrides.get(normalized)!;
    }

    // 3. Command overrides from database (command_settings)
    if (this.commandOverrideService) {
      const [catOverride, modOverride, directOverride] = await Promise.all([
        this.commandOverrideService.resolve(guildId, null, `category:${normalized}`),
        this.commandOverrideService.resolve(guildId, null, `module:${normalized}`),
        this.commandOverrideService.resolve(guildId, null, normalized),
      ]);

      const effective = catOverride ?? modOverride ?? directOverride;
      if (effective) {
        return effective.enabled;
      }
    }

    // 4. Guild settings specific checks
    if (this.guildSettingsService) {
      const settings = await this.guildSettingsService.getSettings(guildId).catch(() => null);
      if (settings) {
        // If maxGameWager is explicitly set to 0, wager games module is disabled
        if (normalized === 'games' && settings.maxGameWager === 0) {
          return false;
        }
      }
    }

    return this.defaultEnabled;
  }

  /**
   * Sets a dynamic in-memory toggle override for a specific guild and module category.
   */
  public setModuleEnabled(guildId: string, category: string, enabled: boolean): void {
    const normalized = category.toLowerCase().trim();
    let guildMap = this.explicitOverrides.get(guildId);
    if (!guildMap) {
      guildMap = new Map<string, boolean>();
      this.explicitOverrides.set(guildId, guildMap);
    }
    guildMap.set(normalized, enabled);
  }

  /**
   * Removes in-memory overrides for a guild (or all guilds).
   */
  public invalidate(guildId?: string): void {
    if (guildId) {
      this.explicitOverrides.delete(guildId);
    } else {
      this.explicitOverrides.clear();
    }
  }
}
