import { createCanvas, loadImage, type SKRSContext2D, type Image } from '@napi-rs/canvas';
import fs from 'node:fs/promises';
import type { UserRepository, EconomyRepository } from '@ririko/database';
import type { LevelingService } from './leveling.service.js';
import type { BankingService } from './banking.service.js';
import type { LeaderboardService } from './leaderboard.service.js';
import type {
  ProfileCardData,
  ProfileCardRenderOptions,
  ProfileCardRendererOptions,
  EquippedTcgCardView,
} from './types.js';

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 400;

const RARITY_COLORS: Record<string, string> = {
  COMMON: '#94a3b8',
  UNCOMMON: '#22c55e',
  RARE: '#3b82f6',
  SUPER_RARE: '#8b5cf6',
  ULTRA_RARE: '#ec4899',
  LEGENDARY: '#f59e0b',
  MYTHICAL: '#ef4444',
  SECRET_RARE: '#06b6d4',
};

const PRESENCE_COLORS: Record<string, string> = {
  online: '#10b981',
  idle: '#f59e0b',
  dnd: '#ef4444',
  offline: '#64748b',
};

function formatNumber(val: number | bigint | undefined): string {
  if (val === undefined || val === null) return '0';
  const num = typeof val === 'bigint' ? Number(val) : val;
  return num.toLocaleString('en-US');
}

function truncateText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}

/**
 * High-performance Profile Card 2.0 Canvas Renderer implementing Section 6.2 of docs/economy.md:
 * - 1200x400 px crisp resolution with glassmorphic dark design.
 * - Discord avatar with presence indicator & Level badge.
 * - Server & Global dense rank pills.
 * - Financial status panel (Wallet, Bank, Total XP).
 * - XP progress bar with gradient fill and exact percentage calculations.
 * - Equipped Waifu TCG collectible card showcase slot.
 * - Dynamic custom profile background with fallback to cyber mesh gradient.
 */
export class ProfileCardRenderer {
  private readonly userRepository?: UserRepository | undefined;
  private readonly economyRepository?: EconomyRepository | undefined;
  private readonly levelingService?: LevelingService | undefined;
  private readonly bankingService?: BankingService | undefined;
  private readonly leaderboardService?: LeaderboardService | undefined;

  constructor(options?: ProfileCardRendererOptions) {
    this.userRepository = options?.userRepository;
    this.economyRepository = options?.economyRepository;
    this.levelingService = options?.levelingService;
    this.bankingService = options?.bankingService;
    this.leaderboardService = options?.leaderboardService;
  }

  /**
   * Directly renders a Profile Card from the provided data payload.
   */
  public async renderProfileCard(data: ProfileCardData): Promise<Buffer> {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');

    // 1. Base clipping for rounded card frame (radius: 20px)
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 20);
    ctx.clip();

    // 2. Draw Background (Custom background image or cyberpunk mesh)
    await this.drawBackground(ctx, data);

    // 3. Draw Avatar, Presence & Level Badge
    await this.drawAvatarSection(ctx, data);

    // 4. Draw User Info, Badges & Financial Stats
    this.drawMiddleSection(ctx, data);

    // 5. Draw XP Progress Bar
    this.drawProgressBarSection(ctx, data);

    // 6. Draw Equipped Waifu TCG Card Slot
    await this.drawTcgCardSlot(ctx, data.equippedCard);

    // 7. Draw Card Outer Border & Branding Watermark
    ctx.restore(); // Exit clip

    // Card Glass Border
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0.75, 0.75, CARD_WIDTH - 1.5, CARD_HEIGHT - 1.5, 20);
    const borderGrad = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    borderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    borderGrad.addColorStop(0.5, 'rgba(0, 242, 254, 0.25)');
    borderGrad.addColorStop(1, 'rgba(139, 92, 246, 0.2)');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    return canvas.encode('png');
  }

  /**
   * High-level orchestrator: loads user state from repositories and generates the card.
   */
  public async renderFromRepositories(
    userId: string,
    guildId?: string,
    options?: ProfileCardRenderOptions,
  ): Promise<Buffer> {
    const user = this.userRepository ? await this.userRepository.findById(userId) : null;
    const displayName = options?.displayName ?? user?.displayName ?? user?.username ?? 'Adventurer';
    const username = options?.username ?? user?.username ?? 'adventurer';
    const avatarUrl = options?.avatarUrl ?? user?.avatarUrl ?? undefined;
    const customBackgroundPathOrUrl = user?.profileBackgroundUrl ?? undefined;

    if (!user && this.userRepository && (options?.username || options?.displayName)) {
      try {
        await this.userRepository.create({
          id: userId,
          username: options.username ?? `user_${userId}`,
          displayName: options.displayName ?? null,
          avatarUrl: options.avatarUrl ?? null,
        });
      } catch {
        // Ignore potential concurrent creation
      }
    }

    // Balances
    let walletBalance = 0;
    let bankBalance = 0;
    let bankCapacity = 10000;
    if (this.economyRepository) {
      const bal = await this.economyRepository.findById(userId);
      if (bal) {
        walletBalance = bal.walletBalance;
        bankBalance = bal.bankBalance;
        bankCapacity = bal.bankCapacity;
      }
    }

    // Level, XP & Ranks
    let globalRank: string | number = 'N/A';
    let serverRank: string | number = 'N/A';
    let totalXp = 0;
    let level = 0;
    let currentLevelXp = 0;
    let xpForNextLevel = 100;
    let progressPercent = 0;
    let karma = 0;

    if (this.leaderboardService && guildId) {
      const rankInfo = await this.leaderboardService.getUserRank(userId, guildId);
      if (rankInfo) {
        serverRank = rankInfo.serverRank;
        globalRank = rankInfo.globalRank;
        totalXp = rankInfo.totalXp ?? 0;
      }
    }

    if (this.levelingService) {
      if (guildId) {
        try {
          const karmaProf = await this.levelingService.getKarmaProfile(userId, guildId);
          karma = karmaProf.karma ?? 0;
        } catch {
          karma = 0;
        }
      }
      const progress = this.levelingService.getLevelProgress(totalXp);
      level = progress.level;
      currentLevelXp = progress.currentLevelXp;
      xpForNextLevel = progress.xpForNextLevel;
      progressPercent = progress.progressPercent;
    }

    const cardData: ProfileCardData = {
      userId,
      username,
      displayName,
      avatarUrl,
      avatarBuffer: options?.avatarBuffer,
      presenceStatus: options?.presenceStatus ?? 'offline',
      level,
      currentLevelXp,
      xpForNextLevel,
      totalXp,
      progressPercent,
      walletBalance,
      bankBalance,
      bankCapacity,
      karma,
      serverRank,
      globalRank,
      customBackgroundPathOrUrl,
      equippedCard: options?.equippedCard,
    };

    return this.renderProfileCard(cardData);
  }

  // ==========================================
  // Rendering Helpers
  // ==========================================

  private async drawBackground(ctx: SKRSContext2D, data: ProfileCardData): Promise<void> {
    let bgImage: Image | null = null;

    if (data.customBackgroundBuffer) {
      try {
        bgImage = await loadImage(data.customBackgroundBuffer);
      } catch {
        bgImage = null;
      }
    } else if (data.customBackgroundPathOrUrl) {
      try {
        if (
          data.customBackgroundPathOrUrl.startsWith('http://') ||
          data.customBackgroundPathOrUrl.startsWith('https://')
        ) {
          const res = await fetch(data.customBackgroundPathOrUrl, { signal: AbortSignal.timeout(3000) });
          if (res.ok) {
            const arr = await res.arrayBuffer();
            bgImage = await loadImage(Buffer.from(arr));
          }
        } else {
          const buf = await fs.readFile(data.customBackgroundPathOrUrl);
          bgImage = await loadImage(buf);
        }
      } catch {
        bgImage = null;
      }
    }

    if (bgImage) {
      // Draw image scaled to cover canvas
      ctx.drawImage(bgImage, 0, 0, CARD_WIDTH, CARD_HEIGHT);

      // Dark translucent gradient overlay for high contrast readability
      const overlay = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
      overlay.addColorStop(0, 'rgba(10, 13, 22, 0.92)');
      overlay.addColorStop(0.5, 'rgba(15, 20, 32, 0.86)');
      overlay.addColorStop(1, 'rgba(12, 16, 26, 0.94)');
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    } else {
      // Default Cyberpunk Glass Background
      const baseGrad = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
      baseGrad.addColorStop(0, '#0a0d16');
      baseGrad.addColorStop(0.5, '#0f1523');
      baseGrad.addColorStop(1, '#131b2e');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

      // Ambient radial neon glows
      const glow1 = ctx.createRadialGradient(180, 120, 10, 180, 120, 260);
      glow1.addColorStop(0, 'rgba(0, 242, 254, 0.16)');
      glow1.addColorStop(1, 'rgba(0, 242, 254, 0)');
      ctx.fillStyle = glow1;
      ctx.fillRect(0, 0, 500, 400);

      const glow2 = ctx.createRadialGradient(850, 300, 20, 850, 300, 300);
      glow2.addColorStop(0, 'rgba(139, 92, 246, 0.14)');
      glow2.addColorStop(1, 'rgba(139, 92, 246, 0)');
      ctx.fillStyle = glow2;
      ctx.fillRect(500, 0, 700, 400);
    }

    // Subtle decorative grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 60; x < CARD_WIDTH; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CARD_HEIGHT);
      ctx.stroke();
    }
  }

  private async drawAvatarSection(ctx: SKRSContext2D, data: ProfileCardData): Promise<void> {
    const centerX = 130;
    const centerY = 145;
    const radius = 68;

    let avatarImg: Image | null = null;
    if (data.avatarBuffer) {
      try {
        avatarImg = await loadImage(data.avatarBuffer);
      } catch {
        avatarImg = null;
      }
    } else if (data.avatarUrl) {
      try {
        const res = await fetch(data.avatarUrl, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const arr = await res.arrayBuffer();
          avatarImg = await loadImage(Buffer.from(arr));
        }
      } catch {
        avatarImg = null;
      }
    }

    // Avatar glow ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2);
    const ringGrad = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
    ringGrad.addColorStop(0, '#00f2fe');
    ringGrad.addColorStop(1, '#8b5cf6');
    ctx.strokeStyle = ringGrad;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.restore();

    // Circular Avatar Clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();

    if (avatarImg) {
      ctx.drawImage(avatarImg, centerX - radius, centerY - radius, radius * 2, radius * 2);
    } else {
      // Fallback Initials Avatar
      const initGrad = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
      initGrad.addColorStop(0, '#1e293b');
      initGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = initGrad;
      ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initial = (data.displayName || data.username || 'A')[0]?.toUpperCase() ?? 'A';
      ctx.fillText(initial, centerX, centerY);
    }
    ctx.restore();

    // Presence Indicator Dot
    const presenceKey = data.presenceStatus ?? 'offline';
    const presenceColor = PRESENCE_COLORS[presenceKey] ?? PRESENCE_COLORS.offline;
    const dotX = centerX + 46;
    const dotY = centerY + 46;
    const dotRadius = 14;

    ctx.save();
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotRadius + 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0d16';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = presenceColor!;
    ctx.fill();
    ctx.restore();

    // Level Badge Pill (underneath avatar)
    const badgeW = 140;
    const badgeH = 34;
    const badgeX = centerX - badgeW / 2;
    const badgeY = centerY + radius + 22;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#00f2fe';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`LVL ${data.level}`, centerX, badgeY + badgeH / 2);
    ctx.restore();

    // Karma Indicator (underneath Level badge)
    ctx.save();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`✨ ${data.karma ?? 0} Karma`, centerX, badgeY + badgeH + 24);
    ctx.restore();
  }

  private drawMiddleSection(ctx: SKRSContext2D, data: ProfileCardData): void {
    const startX = 240;

    // Display Name
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const displayStr = truncateText(ctx, data.displayName, 380);
    ctx.fillText(displayStr, startX, 64);

    // Handle / Username
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.fillText(`@${data.username}`, startX, 90);
    ctx.restore();

    // Server & Global Rank Badges (Top Right of middle section)
    this.drawRankBadge(ctx, 640, 42, 'SERVER', data.serverRank, '#fbbf24', 'rgba(245, 158, 11, 0.18)');
    this.drawRankBadge(ctx, 780, 42, 'GLOBAL', data.globalRank, '#a78bfa', 'rgba(139, 92, 246, 0.18)');

    // 3 Financial / Stats Glass Cards
    const cardY = 118;
    const cardW = 215;
    const cardH = 64;

    // Wallet Card
    this.drawStatCard(ctx, startX, cardY, cardW, cardH, 'WALLET', `🪙 ${formatNumber(data.walletBalance)}`, '#facc15');

    // Bank Card
    this.drawStatCard(ctx, startX + cardW + 15, cardY, cardW, cardH, 'BANK', `🏦 ${formatNumber(data.bankBalance)}`, '#38bdf8');

    // Total XP Card
    this.drawStatCard(ctx, startX + (cardW + 15) * 2, cardY, cardW, cardH, 'TOTAL EXP', `⭐ ${formatNumber(data.totalXp)}`, '#c084fc');
  }

  private drawRankBadge(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    label: string,
    rank: number | string | undefined,
    color: string,
    bgColor: string,
  ): void {
    const w = 125;
    const h = 32;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();

    const rankStr = rank === undefined || rank === null || rank === 0 ? 'N/A' : typeof rank === 'number' ? `#${rank}` : String(rank);

    ctx.fillStyle = color;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${label} ${rankStr}`, x + w / 2, y + h / 2);
    ctx.restore();
  }

  private drawStatCard(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    valColor: string,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 14, y + 22);

    // Value
    ctx.fillStyle = valColor;
    ctx.font = 'bold 18px sans-serif';
    const truncatedVal = truncateText(ctx, value, w - 24);
    ctx.fillText(truncatedVal, x + 14, y + 48);
    ctx.restore();
  }

  private drawProgressBarSection(ctx: SKRSContext2D, data: ProfileCardData): void {
    const startX = 240;
    const barW = 675;
    const barH = 20;
    const barY = 240;

    // Header Info
    ctx.save();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('EXP PROGRESS', startX, 226);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'right';
    const percentClamped = Math.min(100, Math.max(0, data.progressPercent));
    ctx.fillText(
      `${formatNumber(data.currentLevelXp)} / ${formatNumber(data.xpForNextLevel)} XP (${percentClamped.toFixed(1)}%)`,
      startX + barW,
      226,
    );

    // Progress Bar Track
    ctx.beginPath();
    ctx.roundRect(startX, barY, barW, barH, barH / 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Progress Fill
    const fillW = Math.max(barH, Math.min(barW, (percentClamped / 100) * barW));
    if (fillW > 0) {
      ctx.beginPath();
      ctx.roundRect(startX, barY, fillW, barH, barH / 2);
      const fillGrad = ctx.createLinearGradient(startX, barY, startX + barW, barY);
      fillGrad.addColorStop(0, '#00f2fe');
      fillGrad.addColorStop(0.5, '#4facfe');
      fillGrad.addColorStop(1, '#8b5cf6');
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Top gloss highlight
      ctx.beginPath();
      ctx.roundRect(startX, barY, fillW, barH / 2, [barH / 2, barH / 2, 0, 0]);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fill();
    }

    // Remaining XP Subtext
    const remaining = Math.max(0, data.xpForNextLevel - data.currentLevelXp);
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${formatNumber(remaining)} XP required for Level ${data.level + 1}`, startX, 282);

    // Bottom Watermark
    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.font = '11px sans-serif';
    ctx.fillText('RIRIKO AI 2.0 • LEVELING & FINANCIAL ENGINE', startX, 360);
    ctx.restore();
  }

  private async drawTcgCardSlot(ctx: SKRSContext2D, card?: EquippedTcgCardView): Promise<void> {
    const slotX = 955;
    const slotY = 32;
    const slotW = 205;
    const slotH = 336;
    const radius = 16;

    const rarity = card?.rarity?.toUpperCase() ?? 'COMMON';
    const rarityColor = RARITY_COLORS[rarity] ?? RARITY_COLORS.COMMON;

    ctx.save();

    if (card) {
      // Equipped Card Frame
      ctx.beginPath();
      ctx.roundRect(slotX, slotY, slotW, slotH, radius);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fill();

      // Outer Rarity Glow Border
      ctx.strokeStyle = rarityColor!;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Inner Card Image Area
      let cardImg: Image | null = null;
      if (card.imageBuffer) {
        try {
          cardImg = await loadImage(card.imageBuffer);
        } catch {
          cardImg = null;
        }
      } else if (card.imageUrl) {
        try {
          const res = await fetch(card.imageUrl, { signal: AbortSignal.timeout(3000) });
          if (res.ok) {
            const arr = await res.arrayBuffer();
            cardImg = await loadImage(Buffer.from(arr));
          }
        } catch {
          cardImg = null;
        }
      }

      const innerPad = 8;
      const innerW = slotW - innerPad * 2;
      const innerH = slotH - 74;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(slotX + innerPad, slotY + innerPad, innerW, innerH, radius - 4);
      ctx.clip();

      if (cardImg) {
        ctx.drawImage(cardImg, slotX + innerPad, slotY + innerPad, innerW, innerH);
      } else {
        // Stylized card art placeholder
        const artGrad = ctx.createLinearGradient(slotX, slotY, slotX + slotW, slotY + slotH);
        artGrad.addColorStop(0, '#1e293b');
        artGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = artGrad;
        ctx.fillRect(slotX + innerPad, slotY + innerPad, innerW, innerH);

        ctx.fillStyle = rarityColor!;
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎴', slotX + slotW / 2, slotY + innerH / 2);
      }
      ctx.restore();

      // Rarity Tag Pill at Top Right of Card
      const tagW = 90;
      const tagH = 22;
      ctx.beginPath();
      ctx.roundRect(slotX + slotW - tagW - 12, slotY + 14, tagW, tagH, 6);
      ctx.fillStyle = 'rgba(10, 14, 24, 0.85)';
      ctx.fill();
      ctx.strokeStyle = rarityColor!;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = rarityColor!;
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rarity.replace('_', ' '), slotX + slotW - tagW / 2 - 12, slotY + 14 + tagH / 2);

      // Serial Number Tag (if present)
      if (card.serialNumber) {
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(card.serialNumber, slotX + 14, slotY + 28);
      }

      // Card Name Banner at bottom
      const bannerH = 50;
      const bannerY = slotY + slotH - bannerH - 8;
      ctx.beginPath();
      ctx.roundRect(slotX + innerPad, bannerY, innerW, bannerH, 10);
      ctx.fillStyle = 'rgba(10, 14, 24, 0.88)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      const cardTitle = truncateText(ctx, card.name, innerW - 16);
      ctx.fillText(cardTitle, slotX + slotW / 2, bannerY + 22);

      ctx.fillStyle = rarityColor!;
      ctx.font = '11px sans-serif';
      ctx.fillText('EQUIPPED WAIFU TCG', slotX + slotW / 2, bannerY + 38);
    } else {
      // Empty Card Slot
      ctx.beginPath();
      ctx.roundRect(slotX, slotY, slotW, slotH, radius);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = '#475569';
      ctx.font = '42px sans-serif';
      ctx.fillText('🎴', slotX + slotW / 2, slotY + 120);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('NO CARD EQUIPPED', slotX + slotW / 2, slotY + 180);

      ctx.fillStyle = '#475569';
      ctx.font = '12px sans-serif';
      ctx.fillText('Waifu TCG Showcase', slotX + slotW / 2, slotY + 205);

      // Equip Hint Pill
      const hintW = 110;
      const hintH = 26;
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.roundRect(slotX + slotW / 2 - hintW / 2, slotY + 240, hintW, hintH, 13);
      ctx.fillStyle = 'rgba(0, 242, 254, 0.1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#00f2fe';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('/tcg equip', slotX + slotW / 2, slotY + 240 + hintH / 2);
    }

    ctx.restore();
  }
}
