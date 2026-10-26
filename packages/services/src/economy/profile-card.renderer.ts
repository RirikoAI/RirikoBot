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

// Discord shows the card at about 57% of its size, so no text is drawn below 20 px and the
// main values are 30 px or more. Layout: avatar column, middle column, equipped card slot.
const COLUMN_X = 250;
const COLUMN_RIGHT = 925;
const SLOT_X = 945;
const SLOT_Y = 20;
const SLOT_W = 240;
const SLOT_H = 360; // 2:3, the shape of the rendered Waifu TCG card (800x1200)
const SLOT_RADIUS = 16;

const TEXT_SECONDARY = '#cbd5e1';

const RARITY_COLORS: Record<string, string> = {
  COMMON: '#94a3b8',
  UNCOMMON: '#22c55e',
  RARE: '#3b82f6',
  SUPER_RARE: '#8b5cf6',
  ULTRA_RARE: '#ec4899',
  LEGENDARY: '#f59e0b',
  MYTHIC: '#ef4444',
  SIR: '#f472b6',
  SECRET_RARE: '#06b6d4',
};

const PRESENCE_COLORS: Record<NonNullable<ProfileCardData['presenceStatus']>, string> = {
  online: '#10b981',
  idle: '#f59e0b',
  dnd: '#ef4444',
  offline: '#64748b',
};

const COMPACT_NUMBER = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

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

/** Draws text with a soft shadow, so it stays readable on a bright custom background. */
function fillShadowedText(ctx: SKRSContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Picks the text of a main value that fits `maxWidth` and leaves `ctx.font` set to the size it
 * fits at: 32 px, then 30 px, then the compact form (12.3M) at 30 px. The value is never
 * smaller than 30 px and a number that is too big is shortened, not cut off.
 */
function fitMainValue(
  ctx: SKRSContext2D,
  val: number | bigint | undefined,
  maxWidth: number,
): string {
  const full = formatNumber(val);
  for (const size of [32, 30]) {
    ctx.font = `bold ${size}px sans-serif`;
    if (ctx.measureText(full).width <= maxWidth) return full;
  }
  return COMPACT_NUMBER.format(typeof val === 'bigint' ? Number(val) : (val ?? 0));
}

type IconKind = 'coin' | 'bank' | 'star' | 'sparkle' | 'card';

/** Adds a star outline to the current path. */
function starPath(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points: number,
): void {
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * Draws a small icon from canvas paths, centred on (cx, cy) inside a `size` box. No canvas
 * font has emoji glyphs (the Docker image only has DejaVu), so emoji would draw as boxes.
 */
function drawIcon(
  ctx: SKRSContext2D,
  kind: IconKind,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const r = size / 2;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.lineJoin = 'round';
  ctx.beginPath();

  if (kind === 'coin') {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(10, 13, 22, 0.55)';
    ctx.stroke();
  } else if (kind === 'bank') {
    // Roof, beam, three columns and a base.
    ctx.moveTo(cx - r, cy - r * 0.3);
    ctx.lineTo(cx, cy - r);
    ctx.lineTo(cx + r, cy - r * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - r * 0.85, cy - r * 0.18, r * 1.7, r * 0.16);
    const columnW = r * 0.28;
    for (const dx of [-0.55, 0, 0.55]) {
      ctx.fillRect(cx + dx * r - columnW / 2, cy + r * 0.04, columnW, r * 0.7);
    }
    ctx.fillRect(cx - r, cy + r * 0.82, size, r * 0.18);
  } else if (kind === 'star') {
    starPath(ctx, cx, cy + r * 0.06, r, r * 0.42, 5);
    ctx.fill();
  } else if (kind === 'sparkle') {
    starPath(ctx, cx - r * 0.12, cy + r * 0.14, r * 0.86, r * 0.24, 4);
    ctx.fill();
    ctx.beginPath();
    starPath(ctx, cx + r * 0.62, cy - r * 0.6, r * 0.4, r * 0.12, 4);
    ctx.fill();
  } else {
    // A trading card with a diamond in the middle.
    ctx.roundRect(cx - size * 0.34, cy - r, size * 0.68, size, size * 0.1);
    ctx.stroke();
    ctx.beginPath();
    starPath(ctx, cx, cy, size * 0.2, size * 0.07, 4);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * High-performance Profile Card 2.0 Canvas Renderer implementing Section 6.2 of docs/archive/economy-design.md:
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

    // 7. Draw Card Outer Border
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
    if (this.bankingService) {
      bankCapacity = await this.bankingService.refreshCapacity(userId);
    }
    if (this.economyRepository) {
      const bal = await this.economyRepository.findById(userId);
      if (bal) {
        walletBalance = bal.walletBalance;
        bankBalance = bal.bankBalance;
        if (!this.bankingService) bankCapacity = bal.bankCapacity;
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
      // Unknown presence stays unknown: no dot is drawn for it.
      presenceStatus: options?.presenceStatus,
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
          const res = await fetch(data.customBackgroundPathOrUrl, {
            signal: AbortSignal.timeout(3000),
          });
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
      // Scale to cover the canvas and crop the overflow at the centre, so the image keeps its
      // aspect ratio whatever its size.
      const scale = Math.max(CARD_WIDTH / bgImage.width, CARD_HEIGHT / bgImage.height);
      const srcW = CARD_WIDTH / scale;
      const srcH = CARD_HEIGHT / scale;
      ctx.drawImage(
        bgImage,
        (bgImage.width - srcW) / 2,
        (bgImage.height - srcH) / 2,
        srcW,
        srcH,
        0,
        0,
        CARD_WIDTH,
        CARD_HEIGHT,
      );

      // Dark translucent gradient overlay: light enough to show the image, dark enough to read.
      // The stat panels carry their own dark fill.
      const overlay = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
      overlay.addColorStop(0, 'rgba(10, 13, 22, 0.7)');
      overlay.addColorStop(0.5, 'rgba(15, 20, 32, 0.58)');
      overlay.addColorStop(1, 'rgba(12, 16, 26, 0.68)');
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
    const centerY = 124;
    const radius = 80;

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
    const ringGrad = ctx.createLinearGradient(
      centerX - radius,
      centerY - radius,
      centerX + radius,
      centerY + radius,
    );
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
      const initGrad = ctx.createLinearGradient(
        centerX - radius,
        centerY - radius,
        centerX + radius,
        centerY + radius,
      );
      initGrad.addColorStop(0, '#1e293b');
      initGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = initGrad;
      ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 56px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initial = (data.displayName || data.username || 'A')[0]?.toUpperCase() ?? 'A';
      ctx.fillText(initial, centerX, centerY);
    }
    ctx.restore();

    // Presence Indicator Dot: only when the member's real presence is known.
    if (data.presenceStatus) {
      const dotX = centerX + 58;
      const dotY = centerY + 58;
      const dotRadius = 16;

      ctx.save();
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotRadius + 3, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0d16';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = PRESENCE_COLORS[data.presenceStatus];
      ctx.fill();
      ctx.restore();
    }

    // Level Badge Pill (underneath avatar)
    const badgeW = 176;
    const badgeH = 50;
    const badgeX = centerX - badgeW / 2;
    const badgeY = centerY + radius + 28;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#00f2fe';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`LVL ${data.level}`, centerX, badgeY + badgeH / 2);
    ctx.restore();

    // Karma Indicator (underneath Level badge): a drawn sparkle and the amount.
    ctx.save();
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const karmaText = `${data.karma ?? 0} Karma`;
    const iconSize = 26;
    const iconGap = 8;
    const karmaY = badgeY + badgeH + 30;
    const karmaLeft = centerX - (iconSize + iconGap + ctx.measureText(karmaText).width) / 2;
    drawIcon(ctx, 'sparkle', karmaLeft + iconSize / 2, karmaY, iconSize, '#c084fc');
    fillShadowedText(ctx, karmaText, karmaLeft + iconSize + iconGap, karmaY);
    ctx.restore();
  }

  private drawMiddleSection(ctx: SKRSContext2D, data: ProfileCardData): void {
    const startX = COLUMN_X;
    const columnW = COLUMN_RIGHT - COLUMN_X;

    // Display Name (the server nickname when the command knows it)
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    fillShadowedText(ctx, truncateText(ctx, data.displayName, columnW), startX, 62);
    ctx.restore();

    // Server & Global Rank Badges (right-aligned on the second row)
    const rowY = 78;
    const rowH = 40;
    const globalLeft = this.drawRankBadge(
      ctx,
      COLUMN_RIGHT,
      rowY,
      rowH,
      'GLOBAL',
      data.globalRank,
      '#a78bfa',
      'rgba(139, 92, 246, 0.18)',
    );
    const serverLeft = this.drawRankBadge(
      ctx,
      globalLeft - 12,
      rowY,
      rowH,
      'SERVER',
      data.serverRank,
      '#fbbf24',
      'rgba(245, 158, 11, 0.18)',
    );

    // Handle / Username, on the same row and clear of the rank badges
    ctx.save();
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    fillShadowedText(
      ctx,
      truncateText(ctx, `@${data.username}`, serverLeft - startX - 16),
      startX,
      rowY + rowH / 2,
    );
    ctx.restore();

    // 3 Financial / Stats Glass Cards
    const cardY = 134;
    const cardW = 215;
    const cardH = 100;
    const gap = (columnW - cardW * 3) / 2;

    this.drawStatCard(
      ctx,
      startX,
      cardY,
      cardW,
      cardH,
      'WALLET',
      data.walletBalance,
      '#facc15',
      'coin',
    );
    this.drawStatCard(
      ctx,
      startX + cardW + gap,
      cardY,
      cardW,
      cardH,
      'BANK',
      data.bankBalance,
      '#38bdf8',
      'bank',
    );
    this.drawStatCard(
      ctx,
      startX + (cardW + gap) * 2,
      cardY,
      cardW,
      cardH,
      'TOTAL EXP',
      data.totalXp,
      '#c084fc',
      'star',
    );
  }

  /** Draws a rank pill whose right edge is at `right`, and returns its left edge. */
  private drawRankBadge(
    ctx: SKRSContext2D,
    right: number,
    y: number,
    h: number,
    label: string,
    rank: number | string | undefined,
    color: string,
    bgColor: string,
  ): number {
    const rankStr =
      rank === undefined || rank === null || rank === 0
        ? 'N/A'
        : typeof rank === 'number'
          ? `#${rank}`
          : String(rank);
    const text = `${label} ${rankStr}`;

    ctx.save();
    ctx.font = 'bold 20px sans-serif';
    const w = Math.max(150, Math.ceil(ctx.measureText(text).width) + 28);
    const x = right - w;

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.restore();
    return x;
  }

  private drawStatCard(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: number | bigint | undefined,
    valColor: string,
    icon: IconKind,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Icon and label on the top row
    const iconSize = 26;
    drawIcon(ctx, icon, x + 16 + iconSize / 2, y + 28, iconSize, valColor);
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 16 + iconSize + 10, y + 28);

    // Value on its own row, with the full width of the panel
    ctx.fillStyle = valColor;
    const text = fitMainValue(ctx, value, w - 32);
    ctx.fillText(text, x + 16, y + 68);
    ctx.restore();
  }

  private drawProgressBarSection(ctx: SKRSContext2D, data: ProfileCardData): void {
    const startX = COLUMN_X;
    const barW = COLUMN_RIGHT - COLUMN_X;
    const barH = 32;
    const barY = 284;

    // Header Info
    ctx.save();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    fillShadowedText(ctx, 'EXP PROGRESS', startX, 266);

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'right';
    const percentClamped = Math.min(100, Math.max(0, data.progressPercent));
    fillShadowedText(
      ctx,
      `${formatNumber(data.currentLevelXp)} / ${formatNumber(data.xpForNextLevel)} XP (${percentClamped.toFixed(1)}%)`,
      startX + barW,
      266,
    );

    // Progress Bar Track
    ctx.beginPath();
    ctx.roundRect(startX, barY, barW, barH, barH / 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Progress Fill
    const fillW = Math.max(barH, Math.min(barW, (percentClamped / 100) * barW));
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

    // Remaining XP Subtext
    const remaining = Math.max(0, data.xpForNextLevel - data.currentLevelXp);
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'left';
    fillShadowedText(ctx, `${formatNumber(remaining)} XP to Level ${data.level + 1}`, startX, 346);
    ctx.restore();
  }

  /** Loads the equipped card's image from its buffer or URL; null when it cannot be loaded. */
  private async loadCardImage(card: EquippedTcgCardView): Promise<Image | null> {
    try {
      if (card.imageBuffer) return await loadImage(card.imageBuffer);
      if (card.imageUrl) {
        const res = await fetch(card.imageUrl, { signal: AbortSignal.timeout(3000) });
        if (res.ok) return await loadImage(Buffer.from(await res.arrayBuffer()));
      }
    } catch {
      return null;
    }
    return null;
  }

  private async drawTcgCardSlot(ctx: SKRSContext2D, card?: EquippedTcgCardView): Promise<void> {
    const centerX = SLOT_X + SLOT_W / 2;

    ctx.save();

    if (card) {
      const rarity = card.rarity.toUpperCase();
      const rarityColor = RARITY_COLORS[rarity] ?? RARITY_COLORS.COMMON!;
      const cardImg = await this.loadCardImage(card);

      ctx.beginPath();
      ctx.roundRect(SLOT_X, SLOT_Y, SLOT_W, SLOT_H, SLOT_RADIUS);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fill();

      if (cardImg) {
        // The rendered card already shows its name and rarity: draw it contain-fit, nothing on top.
        ctx.save();
        ctx.clip();
        const scale = Math.min(SLOT_W / cardImg.width, SLOT_H / cardImg.height);
        const drawW = cardImg.width * scale;
        const drawH = cardImg.height * scale;
        ctx.drawImage(
          cardImg,
          SLOT_X + (SLOT_W - drawW) / 2,
          SLOT_Y + (SLOT_H - drawH) / 2,
          drawW,
          drawH,
        );
        ctx.restore();
      } else {
        // The image could not be loaded: show what is known about the card.
        drawIcon(ctx, 'card', centerX, SLOT_Y + 110, 90, rarityColor);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(truncateText(ctx, card.name, SLOT_W - 24), centerX, SLOT_Y + 200);
        ctx.fillStyle = rarityColor;
        ctx.font = '20px sans-serif';
        ctx.fillText(rarity.replace(/_/g, ' '), centerX, SLOT_Y + 232);
        if (card.serialNumber) {
          ctx.fillStyle = TEXT_SECONDARY;
          ctx.fillText(card.serialNumber, centerX, SLOT_Y + 262);
        }
      }

      // Rarity border
      ctx.beginPath();
      ctx.roundRect(SLOT_X + 1.5, SLOT_Y + 1.5, SLOT_W - 3, SLOT_H - 3, SLOT_RADIUS);
      ctx.strokeStyle = rarityColor;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      // Empty Card Slot
      ctx.beginPath();
      ctx.roundRect(SLOT_X, SLOT_Y, SLOT_W, SLOT_H, SLOT_RADIUS);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.stroke();
      ctx.setLineDash([]);

      drawIcon(ctx, 'card', centerX, SLOT_Y + 109, 90, '#64748b');

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('NO CARD EQUIPPED', centerX, SLOT_Y + 188);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px sans-serif';
      ctx.fillText('Waifu TCG Showcase', centerX, SLOT_Y + 220);

      // Equip Hint Pill: the real slash form of the command that equips a card.
      const hint = '/card action:equip';
      const hintH = 40;
      const hintW = Math.ceil(ctx.measureText(hint).width) + 24;
      ctx.beginPath();
      ctx.roundRect(centerX - hintW / 2, SLOT_Y + 256, hintW, hintH, hintH / 2);
      ctx.fillStyle = 'rgba(0, 242, 254, 0.1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#00f2fe';
      ctx.fillText(hint, centerX, SLOT_Y + 256 + hintH / 2);
    }

    ctx.restore();
  }
}
