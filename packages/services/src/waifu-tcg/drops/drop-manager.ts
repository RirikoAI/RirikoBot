import { randomUUID } from 'node:crypto';
import type { WaifuCardRepository, WaifuAssetRepository, WaifuCard, WaifuAsset, UserCard } from '@ririko/database';
import { CardGenerator, formatCardSerialNumber } from '../card/card-generator.js';

export interface GuildDropConfig {
  dropChannelId?: string;
  messageThreshold: number; // 50-100
  startHour: number; // e.g. 8 (08:00)
  endHour: number; // e.g. 23 (23:00)
  claimTimeoutSeconds: number; // 60s
  antiSnipingCooldownMs: number; // 5 min = 300,000ms
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
  messageThreshold: 50,
  startHour: 8,
  endHour: 23,
  claimTimeoutSeconds: 60,
  antiSnipingCooldownMs: 5 * 60 * 1000,
};

export class DropManager {
  private readonly configs = new Map<string, GuildDropConfig>();
  private readonly uniqueSenders = new Map<string, Set<string>>();
  private readonly activeDrops = new Map<string, ActiveDrop>(); // dropId -> ActiveDrop
  private readonly guildActiveDrops = new Map<string, string>(); // guildId -> dropId
  private readonly lastClaimants = new Map<string, { userId: string; timestamp: number }>(); // guildId -> last claimant info

  constructor(
    private readonly cardRepo: WaifuCardRepository,
    private readonly assetRepo: WaifuAssetRepository,
    private readonly generator: CardGenerator = new CardGenerator(),
  ) {}

  /**
   * Sets or updates guild drop configuration.
   */
  setGuildConfig(guildId: string, config: Partial<GuildDropConfig>): void {
    const existing = this.configs.get(guildId) ?? { ...DEFAULT_DROP_CONFIG };
    this.configs.set(guildId, { ...existing, ...config });
  }

  getGuildConfig(guildId: string): GuildDropConfig {
    return this.configs.get(guildId) ?? { ...DEFAULT_DROP_CONFIG };
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
   * Evaluates whether current timestamp is within active drop hours (docs/waifu-tcg.md:L140).
   */
  isWithinActiveHours(date: Date, config: GuildDropConfig): boolean {
    const hour = date.getHours();
    return hour >= config.startHour && hour < config.endHour;
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
    const config = this.getGuildConfig(guildId);

    // Channel check (if configured)
    if (config.dropChannelId && channelId !== config.dropChannelId) {
      return null;
    }

    // Active hours check (08:00 - 23:00)
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

    // Threshold check (50 - 100 messages from unique members)
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
    const highestSerial = await this.cardRepo.getHighestSerialNumber(card.id);
    const serialNumber = highestSerial + 1;
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
  async claimDrop(
    dropId: string,
    userId: string,
    now: number = Date.now(),
  ): Promise<ClaimResult> {
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
