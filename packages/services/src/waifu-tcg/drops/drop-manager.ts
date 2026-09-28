import { randomUUID } from 'node:crypto';
import type {
  WaifuCardRepository,
  WaifuAssetRepository,
  WaifuCard,
  WaifuAsset,
  UserCard,
  GuildSettings,
} from '@ririko/database';
import { CardGenerator, formatCardSerialNumber } from '../card/card-generator.js';

export interface GuildDropConfig {
  /** Drops only happen when on; a guild's saved settings start off. */
  enabled: boolean;
  /** Only messages here count, and drops post here; unset counts every channel. */
  dropChannelId?: string | undefined;
  messageThreshold: number;
  /** Drops happen from this hour (inclusive) until `endHour` (exclusive); equal hours mean all day. */
  startHour: number;
  endHour: number;
  /** IANA time zone the hours are in. */
  timezone: string;
  claimTimeoutSeconds: number;
  antiSnipingCooldownMs: number;
}

/** Loads a guild's saved drop settings; `null` uses the defaults. */
export type GuildDropConfigLoader = (guildId: string) => Promise<GuildDropConfig | null>;

export interface DropManagerOptions {
  loadConfig?: GuildDropConfigLoader;
}

export interface ActiveDrop {
  id: string;
  guildId: string;
  channelId: string;
  card: WaifuCard;
  asset: WaifuAsset;
  serialNumber: number;
  formattedSerial: string;
  spawnedAt: number;
  expiresAt: number;
  claimed: boolean;
  claimedBy: string | null;
}

export interface ClaimResult {
  success: boolean;
  userCard?: UserCard;
  card?: WaifuCard;
  asset?: WaifuAsset;
  serialNumber?: number;
  formattedSerial?: string;
  error?: string;
}

export const DEFAULT_DROP_CONFIG: GuildDropConfig = {
  enabled: false,
  messageThreshold: 50,
  timezone: 'UTC',
  startHour: 8,
  endHour: 23,
  claimTimeoutSeconds: 60,
  antiSnipingCooldownMs: 5 * 60 * 1000,
};

/** A guild's saved drop settings (`guild_settings`, edited on the dashboard's TCG page). */
export function dropConfigFromSettings(
  row: Pick<
    GuildSettings,
    | 'timezone'
    | 'tcgDropsEnabled'
    | 'tcgDropChannelId'
    | 'tcgDropMessageThreshold'
    | 'tcgDropStartHour'
    | 'tcgDropEndHour'
    | 'tcgDropClaimTimeoutSeconds'
    | 'tcgDropCooldownMinutes'
  >,
): GuildDropConfig {
  return {
    enabled: row.tcgDropsEnabled,
    dropChannelId: row.tcgDropChannelId ?? undefined,
    messageThreshold: row.tcgDropMessageThreshold,
    startHour: row.tcgDropStartHour,
    endHour: row.tcgDropEndHour,
    timezone: row.timezone || DEFAULT_DROP_CONFIG.timezone,
    claimTimeoutSeconds: row.tcgDropClaimTimeoutSeconds,
    antiSnipingCooldownMs: row.tcgDropCooldownMinutes * 60 * 1000,
  };
}

export class DropManager {
  /** Saved settings by guild, loaded once and dropped by `invalidate` when they change. */
  private readonly configs = new Map<string, GuildDropConfig>();
  private readonly pendingLoads = new Map<string, Promise<GuildDropConfig>>();
  private readonly uniqueSenders = new Map<string, Set<string>>();
  private readonly activeDrops = new Map<string, ActiveDrop>(); // dropId -> ActiveDrop
  private readonly guildActiveDrops = new Map<string, string>(); // guildId -> dropId
  private readonly lastClaimants = new Map<string, { userId: string; timestamp: number }>(); // guildId -> last claimant info

  constructor(
    private readonly cardRepo: WaifuCardRepository,
    private readonly assetRepo: WaifuAssetRepository,
    private readonly generator: CardGenerator = new CardGenerator(),
    private readonly options: DropManagerOptions = {},
  ) {}

  /**
   * Sets or updates guild drop configuration in memory (tests, or a bot without saved settings).
   */
  setGuildConfig(guildId: string, config: Partial<GuildDropConfig>): void {
    const existing = this.configs.get(guildId) ?? { ...DEFAULT_DROP_CONFIG };
    this.configs.set(guildId, { ...existing, ...config });
  }

  /** The guild's settings as last loaded, or the defaults. */
  getGuildConfig(guildId: string): GuildDropConfig {
    return this.configs.get(guildId) ?? { ...DEFAULT_DROP_CONFIG };
  }

  /** The guild's settings, loading them through `loadConfig` the first time. */
  async resolveGuildConfig(guildId: string): Promise<GuildDropConfig> {
    const cached = this.configs.get(guildId);
    if (cached) return cached;
    const loader = this.options.loadConfig;
    if (!loader) return { ...DEFAULT_DROP_CONFIG };
    let pending = this.pendingLoads.get(guildId);
    if (!pending) {
      pending = loader(guildId)
        .then((loaded) => {
          const config = loaded ?? { ...DEFAULT_DROP_CONFIG };
          // An invalidate while loading removed the pending entry; keep the stale value out.
          if (this.pendingLoads.get(guildId) === pending) this.configs.set(guildId, config);
          return config;
        })
        .finally(() => {
          if (this.pendingLoads.get(guildId) === pending) this.pendingLoads.delete(guildId);
        });
      this.pendingLoads.set(guildId, pending);
    }
    return pending;
  }

  /** Forgets a guild's settings so the next message loads them again. */
  invalidate(guildId: string): void {
    this.configs.delete(guildId);
    this.pendingLoads.delete(guildId);
    this.uniqueSenders.delete(guildId);
  }

  getActiveDrop(guildId: string): ActiveDrop | null {
    const dropId = this.guildActiveDrops.get(guildId);
    if (!dropId) return null;
    const drop = this.activeDrops.get(dropId);
    if (!drop) return null;
    if (Date.now() > drop.expiresAt) {
      this.clearDrop(guildId, dropId);
      return null;
    }
    return drop;
  }

  getActiveDropById(dropId: string): ActiveDrop | null {
    const drop = this.activeDrops.get(dropId);
    if (!drop) return null;
    if (Date.now() > drop.expiresAt) {
      this.clearDrop(drop.guildId, dropId);
      return null;
    }
    return drop;
  }

  private clearDrop(guildId: string, dropId: string): void {
    this.guildActiveDrops.delete(guildId);
    this.activeDrops.delete(dropId);
  }

  /**
   * Whether `date` is within the guild's drop hours in its time zone (docs/waifu-tcg.md:L140).
   * A start after the end wraps past midnight (20 to 4); equal hours mean all day.
   */
  isWithinActiveHours(date: Date, config: GuildDropConfig): boolean {
    const { startHour, endHour } = config;
    if (startHour === endHour) return true;
    const hour = hourIn(date, config.timezone);
    return startHour < endHour
      ? hour >= startHour && hour < endHour
      : hour >= startHour || hour < endHour;
  }

  /**
   * Records a user message and triggers a card drop if threshold is reached.
   */
  async recordMessage(
    guildId: string,
    channelId: string,
    userId: string,
    now: Date = new Date(),
  ): Promise<ActiveDrop | null> {
    const config = await this.resolveGuildConfig(guildId);
    if (!config.enabled) return null;

    // Channel check (if configured)
    if (config.dropChannelId && channelId !== config.dropChannelId) {
      return null;
    }

    // Active hours check
    if (!this.isWithinActiveHours(now, config)) {
      return null;
    }

    // If a drop is already active in this guild, wait for it to be claimed or expire
    const currentActive = this.getActiveDrop(guildId);
    if (currentActive && !currentActive.claimed) {
      return null;
    }

    // Track unique members
    let senders = this.uniqueSenders.get(guildId);
    if (!senders) {
      senders = new Set<string>();
      this.uniqueSenders.set(guildId, senders);
    }
    senders.add(userId);

    // Threshold check (unique members)
    if (senders.size < config.messageThreshold) {
      return null;
    }

    // Reset unique senders
    senders.clear();

    // Spawn drop
    return this.spawnDrop(guildId, channelId, config);
  }

  /**
   * Spawns a new card drop for the guild.
   */
  async spawnDrop(
    guildId: string,
    channelId: string,
    config: GuildDropConfig = this.getGuildConfig(guildId),
  ): Promise<ActiveDrop | null> {
    // Pick an active asset
    const activeAssets = await this.assetRepo.findActiveAssets(50, 0);
    if (activeAssets.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * activeAssets.length);
    const asset = activeAssets[randomIndex]!;

    // Generate card attributes
    const generated = this.generator.generateCard(asset);

    // Find or create waifu_cards row for this asset + rarity + element combination
    let card = await this.cardRepo.findByAssetId(asset.id);
    if (!card || card.rarity !== generated.rarity || card.element !== generated.element) {
      card = await this.cardRepo.create({
        assetId: asset.id,
        name: generated.name,
        rarity: generated.rarity,
        element: generated.element,
        attack: generated.stats.attack,
        defense: generated.stats.defense,
        speed: generated.stats.speed,
        health: generated.stats.hp,
        critRate: generated.stats.critRate,
        skillName: generated.skill.name,
        skillDescription: generated.skill.description,
        passiveName: generated.passive.name,
        passiveDescription: generated.passive.description,
        collectionNumber: generated.collectionNumber,
        isActive: true,
      });
    }

    // Compute next serial number
    const serialNumber = await this.cardRepo.reserveSerialNumber(card.id);
    const formattedSerial = formatCardSerialNumber(serialNumber);

    const dropId = randomUUID();
    const nowMs = Date.now();
    const activeDrop: ActiveDrop = {
      id: dropId,
      guildId,
      channelId,
      card,
      asset,
      serialNumber,
      formattedSerial,
      spawnedAt: nowMs,
      expiresAt: nowMs + config.claimTimeoutSeconds * 1000,
      claimed: false,
      claimedBy: null,
    };

    this.activeDrops.set(dropId, activeDrop);
    this.guildActiveDrops.set(guildId, dropId);

    return activeDrop;
  }

  /**
   * Claims an active card drop with anti-sniping validation and atomic concurrency lock.
   */
  async claimDrop(dropId: string, userId: string, now: number = Date.now()): Promise<ClaimResult> {
    const drop = this.activeDrops.get(dropId);
    if (!drop) {
      return { success: false, error: 'Drop does not exist or has expired.' };
    }

    if (now > drop.expiresAt) {
      this.clearDrop(drop.guildId, dropId);
      return { success: false, error: 'This card drop has expired!' };
    }

    if (drop.claimed) {
      return {
        success: false,
        error: `This card has already been claimed by <@${drop.claimedBy}>!`,
      };
    }

    const config = this.getGuildConfig(drop.guildId);

    // Anti-Sniping Cooldown check (docs/waifu-tcg.md:L141-142)
    const lastClaim = this.lastClaimants.get(drop.guildId);
    if (lastClaim && lastClaim.userId === userId) {
      const elapsed = now - lastClaim.timestamp;
      if (elapsed < config.antiSnipingCooldownMs) {
        const remainingSeconds = Math.ceil((config.antiSnipingCooldownMs - elapsed) / 1000);
        return {
          success: false,
          error: `Anti-sniping cooldown active! You claimed the previous drop. Please give others a chance (${remainingSeconds}s remaining).`,
        };
      }
    }

    // Atomic claim lock
    drop.claimed = true;
    drop.claimedBy = userId;

    // Update last claimant
    this.lastClaimants.set(drop.guildId, { userId, timestamp: now });

    // Persist card in player's inventory
    const userCard = await this.cardRepo.createUserCard({
      userId,
      cardId: drop.card.id,
      serialNumber: drop.serialNumber,
      level: 1,
      exp: 0,
      state: 'IDLE',
      isFavorite: false,
    });

    // Remove active drop pointer from guild so new drop can spawn later
    this.guildActiveDrops.delete(drop.guildId);

    return {
      success: true,
      userCard,
      card: drop.card,
      asset: drop.asset,
      serialNumber: drop.serialNumber,
      formattedSerial: drop.formattedSerial,
    };
  }
}

/** The hour (0 to 23) at `date` in `timeZone`; an unknown zone falls back to UTC. */
function hourIn(date: Date, timeZone: string): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' })
      .formatToParts(date)
      .find((part) => part.type === 'hour');
    return Number(hour?.value ?? date.getUTCHours());
  } catch {
    return date.getUTCHours();
  }
}
