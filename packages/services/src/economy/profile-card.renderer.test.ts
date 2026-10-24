import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ProfileCardRenderer } from './profile-card.renderer.js';
import { parseImageDimensions } from './profile-background.manager.js';
import type { ProfileCardData, EquippedTcgCardView } from './types.js';
import {
  createDatabaseClient,
  UserRepository,
  EconomyRepository,
  XpRepository,
  GuildSettingsRepository,
  LeaderboardRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { LevelingService } from './leveling.service.js';
import { LeaderboardService } from './leaderboard.service.js';
import { EventBus } from '@ririko/core';

function createSampleImageBuffer(w = 100, h = 100, color = 'blue'): Buffer {
  const canvas: Canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return canvas.toBuffer('image/png');
}

type CanvasMethod = (this: { font: string }, ...args: unknown[]) => unknown;

/**
 * Records every fillText (text and font) and drawImage (arguments) call of every canvas context,
 * while still drawing. `restore` puts the real methods back.
 */
function spyOnCanvas(): {
  texts: Array<{ text: string; font: string; size: number }>;
  images: unknown[][];
  restore: () => void;
} {
  const proto = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d')) as Record<
    string,
    CanvasMethod
  >;
  const originalFillText = proto.fillText!;
  const originalDrawImage = proto.drawImage!;
  const texts: Array<{ text: string; font: string; size: number }> = [];
  const images: unknown[][] = [];

  proto.fillText = function (this: { font: string }, ...args: unknown[]) {
    const font = this.font;
    texts.push({ text: String(args[0]), font, size: Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) });
    return originalFillText.apply(this, args);
  };
  proto.drawImage = function (this: { font: string }, ...args: unknown[]) {
    images.push(args);
    return originalDrawImage.apply(this, args);
  };

  return {
    texts,
    images,
    restore: () => {
      proto.fillText = originalFillText;
      proto.drawImage = originalDrawImage;
    },
  };
}

/** Reads the colour of one pixel of a rendered card. */
async function pixelAt(png: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const canvas = createCanvas(1200, 400);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(await loadImage(png), 0, 0);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
}

// Where the presence dot sits: the avatar centre (130, 124) plus 58 px on both axes.
const DOT_X = 188;
const DOT_Y = 182;

const BASE_CARD: ProfileCardData = {
  userId: 'user_layout',
  username: 'angel.net.my',
  displayName: 'Angel',
  level: 50,
  currentLevelXp: 962,
  xpForNextLevel: 15100,
  totalXp: 269337,
  progressPercent: 6.4,
  walletBalance: 271089,
  bankBalance: 12345,
  karma: 12,
  serverRank: 1,
  globalRank: 1,
};

describe('ProfileCardRenderer', () => {
  let renderer: ProfileCardRenderer;

  beforeEach(() => {
    renderer = new ProfileCardRenderer();
  });

  describe('renderProfileCard (direct data)', () => {
    it('should generate a valid 1200x400 PNG buffer with default cyber mesh background and initials avatar', async () => {
      const data: ProfileCardData = {
        userId: 'user_123',
        username: 'rin_tohsaka',
        displayName: 'Rin Tohsaka',
        presenceStatus: 'online',
        level: 24,
        currentLevelXp: 450,
        xpForNextLevel: 1200,
        totalXp: 35400,
        progressPercent: 37.5,
        walletBalance: 14250,
        bankBalance: 125000,
        bankCapacity: 200000,
        karma: 42,
        serverRank: 3,
        globalRank: 120,
      };

      const buffer = await renderer.renderProfileCard(data);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);

      const dims = parseImageDimensions(buffer);
      expect(dims).toEqual({
        width: 1200,
        height: 400,
        format: 'png',
      });
    });

    it('should render correctly with custom avatar and custom background buffers', async () => {
      const avatarBuf = createSampleImageBuffer(150, 150, '#e11d48');
      const bgBuf = createSampleImageBuffer(1200, 400, '#1e1b4b');

      const data: ProfileCardData = {
        userId: 'user_456',
        username: 'saber_artoria',
        displayName: 'Artoria Pendragon',
        avatarBuffer: avatarBuf,
        customBackgroundBuffer: bgBuf,
        presenceStatus: 'dnd',
        level: 50,
        currentLevelXp: 9800,
        xpForNextLevel: 10000,
        totalXp: 250000,
        progressPercent: 98.0,
        walletBalance: 500000,
        bankBalance: 2500000,
        karma: 150,
        serverRank: 1,
        globalRank: 5,
      };

      const buffer = await renderer.renderProfileCard(data);
      const dims = parseImageDimensions(buffer);

      expect(dims).toEqual({
        width: 1200,
        height: 400,
        format: 'png',
      });
    });

    it('should render equipped Waifu TCG card with rarity styling and serial tag', async () => {
      const cardArtBuf = createSampleImageBuffer(180, 260, '#f59e0b');

      const equippedCard: EquippedTcgCardView = {
        id: 'card_tcg_01',
        name: 'Holo the Wise Wolf',
        rarity: 'LEGENDARY',
        serialNumber: '#0001',
        imageBuffer: cardArtBuf,
      };

      const data: ProfileCardData = {
        userId: 'user_789',
        username: 'holo_lover',
        displayName: 'Lawrence & Holo',
        presenceStatus: 'idle',
        level: 12,
        currentLevelXp: 120,
        xpForNextLevel: 600,
        totalXp: 8500,
        progressPercent: 20,
        walletBalance: 1200,
        bankBalance: 5000,
        karma: 10,
        serverRank: 15,
        globalRank: 'N/A',
        equippedCard,
      };

      const buffer = await renderer.renderProfileCard(data);
      const dims = parseImageDimensions(buffer);

      expect(dims).toEqual({
        width: 1200,
        height: 400,
        format: 'png',
      });
    });

    it('should render cleanly with empty equipped card slot placeholder', async () => {
      const data: ProfileCardData = {
        userId: 'user_newbie',
        username: 'rookie_99',
        displayName: 'Rookie Adventurer',
        presenceStatus: 'offline',
        level: 0,
        currentLevelXp: 0,
        xpForNextLevel: 100,
        totalXp: 0,
        progressPercent: 0,
        walletBalance: 0,
        bankBalance: 0,
        karma: 0,
        serverRank: 'N/A',
        globalRank: 'N/A',
        equippedCard: undefined,
      };

      const buffer = await renderer.renderProfileCard(data);
      const dims = parseImageDimensions(buffer);

      expect(dims).toEqual({
        width: 1200,
        height: 400,
        format: 'png',
      });
    });

    it('should handle all presence statuses and extreme balance numbers without crashing', async () => {
      const statuses = ['online', 'idle', 'dnd', 'offline'] as const;

      for (const status of statuses) {
        const buffer = await renderer.renderProfileCard({
          userId: `user_${status}`,
          username: `user_${status}`,
          displayName: `User With Very Long Display Name Exceeding Normal Width Limit`,
          presenceStatus: status,
          level: 999,
          currentLevelXp: 9999999,
          xpForNextLevel: 10000000,
          totalXp: 999999999,
          progressPercent: 99.9,
          walletBalance: 1234567890123n,
          bankBalance: 9876543210987n,
          karma: 9999,
          serverRank: 99999,
          globalRank: 100000,
        });

        expect(buffer.length).toBeGreaterThan(1000);
      }
    });
  });

  describe('text, icons and layout (BUG-0054)', () => {
    let spy: ReturnType<typeof spyOnCanvas>;

    beforeEach(() => {
      spy = spyOnCanvas();
    });

    afterEach(() => {
      spy.restore();
      vi.restoreAllMocks();
    });

    const EMOJI = /\p{Extended_Pictographic}/u;

    function expectReadableText(): void {
      expect(spy.texts.length).toBeGreaterThan(10);
      for (const { text, font, size } of spy.texts) {
        expect(text, `"${text}" is drawn with an emoji`).not.toMatch(EMOJI);
        expect(size, `"${text}" is drawn in ${font}`).toBeGreaterThanOrEqual(20);
      }
      for (const value of ['271,089', '12,345', '269,337', 'LVL 50']) {
        const drawn = spy.texts.find((t) => t.text === value);
        expect(drawn, `"${value}" is drawn`).toBeDefined();
        expect(drawn!.size, `"${value}" is drawn in ${drawn!.font}`).toBeGreaterThanOrEqual(30);
      }
      expect(spy.texts.some((t) => t.text.includes('RIRIKO AI'))).toBe(false);
    }

    it('draws no emoji, nothing under 20 px and values of 30 px or more with an empty slot', async () => {
      await renderer.renderProfileCard({ ...BASE_CARD, presenceStatus: 'online' });

      expectReadableText();
      const texts = spy.texts.map((t) => t.text);
      expect(texts).toContain('NO CARD EQUIPPED');
      expect(texts).toContain('/card action:equip');
      expect(texts).not.toContain('/tcg equip');
    });

    it('draws the equipped card contain-fit in a 2:3 slot, with no emoji or slot hint', async () => {
      await renderer.renderProfileCard({
        ...BASE_CARD,
        equippedCard: {
          id: 'card_1',
          name: 'Holo',
          rarity: 'LEGENDARY',
          imageBuffer: createSampleImageBuffer(800, 1200, '#f59e0b'),
        },
      });

      expectReadableText();
      const texts = spy.texts.map((t) => t.text);
      expect(texts).not.toContain('NO CARD EQUIPPED');
      expect(texts).not.toContain('/card action:equip');
      // The rendered card shows its own name and rarity, so nothing is written over it.
      expect(texts).not.toContain('Holo');
      expect(texts).not.toContain('LEGENDARY');
      const cardDraw = spy.images.find((args) => args.length === 5 && args[1] === 945);
      expect(cardDraw?.slice(1)).toEqual([945, 20, 240, 360]);
    });

    it('fits a card image of another shape inside the slot without stretching it', async () => {
      await renderer.renderProfileCard({
        ...BASE_CARD,
        equippedCard: {
          id: 'card_sq',
          name: 'Square',
          rarity: 'RARE',
          imageBuffer: createSampleImageBuffer(300, 300),
        },
      });

      const cardDraw = spy.images.find((args) => args.length === 5 && args[1] === 945);
      expect(cardDraw?.slice(1)).toEqual([945, 80, 240, 240]);
    });

    it('shows the card name and rarity when the card image cannot be loaded', async () => {
      await renderer.renderProfileCard({
        ...BASE_CARD,
        equippedCard: {
          id: 'card_broken',
          name: 'Holo the Wise Wolf of Yoitsu',
          rarity: 'SECRET_RARE',
          serialNumber: '#0007',
          imageBuffer: Buffer.from('this is not an image'),
        },
      });

      expectReadableText();
      const texts = spy.texts.map((t) => t.text);
      expect(texts).toContain('SECRET RARE');
      expect(texts).toContain('#0007');
      expect(texts.some((t) => t.startsWith('Holo the Wise') && t.endsWith('...'))).toBe(true);
      expect(texts).not.toContain('NO CARD EQUIPPED');
    });

    it('loads the equipped card from its URL, and falls back when the URL fails', async () => {
      const png = createSampleImageBuffer(800, 1200);
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(new Uint8Array(png)))
        .mockResolvedValueOnce(new Response('gone', { status: 404 }))
        .mockRejectedValueOnce(new Error('network down'));
      const card = {
        id: 'card_url',
        name: 'Url Card',
        rarity: 'RARE',
        imageUrl: 'https://x.test/c.png',
      };

      await renderer.renderProfileCard({ ...BASE_CARD, equippedCard: card });
      expect(spy.images.some((args) => args.length === 5 && args[1] === 945)).toBe(true);
      expect(spy.texts.map((t) => t.text)).not.toContain('Url Card');

      spy.texts.length = 0;
      await renderer.renderProfileCard({ ...BASE_CARD, equippedCard: card });
      await renderer.renderProfileCard({ ...BASE_CARD, equippedCard: card });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(spy.texts.filter((t) => t.text === 'Url Card')).toHaveLength(2);
    });

    it('keeps the text readable on a custom background', async () => {
      await renderer.renderProfileCard({
        ...BASE_CARD,
        customBackgroundBuffer: createSampleImageBuffer(600, 400, '#facc15'),
      });

      expectReadableText();
    });

    it('crops a custom background at the centre instead of stretching it', async () => {
      await renderer.renderProfileCard({
        ...BASE_CARD,
        customBackgroundBuffer: createSampleImageBuffer(600, 400),
      });

      // 600x400 covers 1200x400 at scale 2: the middle 600x200 of the image fills the card.
      const bgDraw = spy.images.find((args) => args.length === 9);
      expect(bgDraw?.slice(1)).toEqual([0, 100, 600, 200, 0, 0, 1200, 400]);
    });

    it('crops a square custom background to the card shape', async () => {
      await renderer.renderProfileCard({
        ...BASE_CARD,
        customBackgroundBuffer: createSampleImageBuffer(800, 800),
      });

      // Scale 1.5: the middle 800 x 266.67 of the image fills the card.
      const bgDraw = spy.images.find((args) => args.length === 9);
      expect(bgDraw).toBeDefined();
      const [, sx, sy, sw, sh] = bgDraw!;
      expect(sx).toBe(0);
      expect(sy).toBeCloseTo(800 / 3, 5);
      expect(sw).toBe(800);
      expect(sh).toBeCloseTo(800 / 3, 5);
    });

    it('reads a custom background from a file path and from a URL', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-bg-'));
      const file = path.join(dir, 'bg.png');
      await fs.writeFile(file, createSampleImageBuffer(1200, 400));
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(new Uint8Array(createSampleImageBuffer(1200, 400))))
        .mockResolvedValueOnce(new Response('gone', { status: 500 }));

      try {
        await renderer.renderProfileCard({ ...BASE_CARD, customBackgroundPathOrUrl: file });
        expect(spy.images.filter((args) => args.length === 9)).toHaveLength(1);

        await renderer.renderProfileCard({
          ...BASE_CARD,
          customBackgroundPathOrUrl: 'https://x.test/bg.png',
        });
        expect(spy.images.filter((args) => args.length === 9)).toHaveLength(2);

        // A URL that answers with an error, and a file that is gone, fall back to the mesh.
        await renderer.renderProfileCard({
          ...BASE_CARD,
          customBackgroundPathOrUrl: 'https://x.test/missing.png',
        });
        await renderer.renderProfileCard({
          ...BASE_CARD,
          customBackgroundPathOrUrl: path.join(dir, 'missing.png'),
        });
        expect(spy.images.filter((args) => args.length === 9)).toHaveLength(2);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });

    it('uses an avatar URL, and the initial when it cannot be loaded', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(new Uint8Array(createSampleImageBuffer(128, 128))))
        .mockResolvedValueOnce(new Response('gone', { status: 404 }))
        .mockRejectedValueOnce(new Error('network down'));

      await renderer.renderProfileCard({ ...BASE_CARD, avatarUrl: 'https://x.test/a.png' });
      expect(spy.texts.map((t) => t.text)).not.toContain('A');

      await renderer.renderProfileCard({ ...BASE_CARD, avatarUrl: 'https://x.test/b.png' });
      await renderer.renderProfileCard({ ...BASE_CARD, avatarUrl: 'https://x.test/c.png' });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(spy.texts.filter((t) => t.text === 'A')).toHaveLength(2);
    });

    it('keeps every text at 20 px or more with very long names and huge numbers', async () => {
      await renderer.renderProfileCard({
        ...BASE_CARD,
        displayName: 'User With Very Long Display Name Exceeding Normal Width Limit And More',
        username: 'a_very_long_username_for_testing_purposes_only',
        presenceStatus: 'dnd',
        level: 999,
        currentLevelXp: 9999999,
        xpForNextLevel: 10000000,
        totalXp: 999999999999,
        progressPercent: 99.9,
        walletBalance: 1234567890123n,
        bankBalance: 98765432,
        karma: 9999,
        serverRank: 99999,
        globalRank: 100000,
        equippedCard: {
          id: 'c',
          name: 'x',
          rarity: 'MYTHIC',
          imageBuffer: createSampleImageBuffer(800, 1200),
        },
      });

      for (const { text, size } of spy.texts) {
        expect(text).not.toMatch(EMOJI);
        expect(size, text).toBeGreaterThanOrEqual(20);
      }
      // A number too wide for its panel is shortened (1.2T), never smaller than 30 px.
      const wallet = spy.texts.find((t) => t.text === '1.2T');
      expect(wallet?.size).toBeGreaterThanOrEqual(30);
      expect(
        spy.texts.find((t) => t.text === '98,765,432' || t.text === '98.8M')?.size,
      ).toBeGreaterThanOrEqual(30);
    });

    it('draws the presence dot only when the presence is known', async () => {
      const online = await renderer.renderProfileCard({ ...BASE_CARD, presenceStatus: 'online' });
      const dnd = await renderer.renderProfileCard({ ...BASE_CARD, presenceStatus: 'dnd' });
      const unknown = await renderer.renderProfileCard(BASE_CARD);

      const [onlineR, onlineG] = await pixelAt(online, DOT_X, DOT_Y);
      expect(onlineG).toBeGreaterThan(150);
      expect(onlineR).toBeLessThan(60);
      const [dndR, dndG] = await pixelAt(dnd, DOT_X, DOT_Y);
      expect(dndR).toBeGreaterThan(200);
      expect(dndG).toBeLessThan(120);
      const dot = await pixelAt(unknown, DOT_X, DOT_Y);
      expect(Math.max(...dot)).toBeLessThan(100);
    });
  });

  describe('renderFromRepositories (end-to-end repository integration)', () => {
    let client: SqliteDatabaseClient;
    let userRepo: UserRepository;
    let economyRepo: EconomyRepository;
    let xpRepo: XpRepository;
    let guildSettingsRepo: GuildSettingsRepository;
    let leaderboardRepo: LeaderboardRepository;
    let levelingService: LevelingService;
    let leaderboardService: LeaderboardService;
    let integratedRenderer: ProfileCardRenderer;

    beforeEach(async () => {
      const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
      if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
      client = rawClient;

      // Create database schema
      client.raw.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          display_name TEXT,
          avatar_url TEXT,
          profile_background_url TEXT,
          is_blacklisted INTEGER NOT NULL DEFAULT 0,
          warn_count INTEGER NOT NULL DEFAULT 0,
          notify_level_up INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE economy_balances (
          user_id TEXT PRIMARY KEY,
          wallet_balance INTEGER NOT NULL DEFAULT 0,
          bank_balance INTEGER NOT NULL DEFAULT 0,
          bank_capacity INTEGER NOT NULL DEFAULT 10000,
          net_worth INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE xp_accounts (
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          xp INTEGER NOT NULL DEFAULT 0,
          level INTEGER NOT NULL DEFAULT 0,
          total_xp INTEGER NOT NULL DEFAULT 0,
          karma INTEGER NOT NULL DEFAULT 0,
          last_xp_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, guild_id)
        );

        CREATE TABLE guild_settings (
          guild_id TEXT PRIMARY KEY,
          prefix TEXT NOT NULL DEFAULT '!',
          locale TEXT NOT NULL DEFAULT 'en-US',
          timezone TEXT NOT NULL DEFAULT 'UTC',
          ai_channel_id TEXT,
          log_channel_id TEXT,
          escalation_steps TEXT,
          welcome_channel_id TEXT,
          welcome_message TEXT,
          leave_channel_id TEXT,
          leave_message TEXT,
          autorole_id TEXT,
          moderation_log_channel_id TEXT,
          muted_role_id TEXT,
          disabled_modules TEXT DEFAULT '[]',
          disabled_commands TEXT DEFAULT '[]',
          karma_notifications_enabled INTEGER NOT NULL DEFAULT 1,
          level_up_channel_id TEXT,
          xp_rate_percent INTEGER NOT NULL DEFAULT 100,
          no_xp_channel_ids TEXT NOT NULL DEFAULT '[]',
          no_xp_role_ids TEXT NOT NULL DEFAULT '[]',
          voice_xp_enabled INTEGER NOT NULL DEFAULT 0,
          max_game_wager INTEGER,
          tcg_drops_enabled INTEGER NOT NULL DEFAULT 0,
          tcg_drop_channel_id TEXT,
          tcg_drop_message_threshold INTEGER NOT NULL DEFAULT 50,
          tcg_drop_start_hour INTEGER NOT NULL DEFAULT 8,
          tcg_drop_end_hour INTEGER NOT NULL DEFAULT 23,
          tcg_drop_claim_timeout_seconds INTEGER NOT NULL DEFAULT 60,
          tcg_drop_cooldown_minutes INTEGER NOT NULL DEFAULT 5,
          tcg_manager_role_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE leaderboard_snapshots (
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          global_rank INTEGER NOT NULL,
          server_rank INTEGER NOT NULL,
          calculated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, guild_id)
        );
      `);

      userRepo = new UserRepository(client);
      economyRepo = new EconomyRepository(client);
      xpRepo = new XpRepository(client);
      guildSettingsRepo = new GuildSettingsRepository(client);
      leaderboardRepo = new LeaderboardRepository(client);

      const eventBus = new EventBus();
      levelingService = new LevelingService({
        xpRepository: xpRepo,
        userRepository: userRepo,
        guildSettingsRepository: guildSettingsRepo,
        eventBus,
      });

      leaderboardService = new LeaderboardService({
        xpRepository: xpRepo,
        leaderboardRepository: leaderboardRepo,
      });

      integratedRenderer = new ProfileCardRenderer({
        userRepository: userRepo,
        economyRepository: economyRepo,
        levelingService,
        leaderboardService,
      });
    });

    it('should fetch user data, compute progress, and synthesize profile card', async () => {
      const userId = 'user_integrated_01';
      const guildId = 'guild_integrated_01';

      // Seed user
      await userRepo.create({
        id: userId,
        username: 'KuroNeko',
        displayName: 'Kuro Neko',
        notifyLevelUp: true,
      });

      // Seed economy balance
      await economyRepo.create({
        userId,
        walletBalance: 2500,
        bankBalance: 18000,
        bankCapacity: 50000,
        netWorth: 20500,
      });

      // Seed XP account & Karma
      await xpRepo.create({
        userId,
        guildId,
        xp: 1500,
        level: 4,
        karma: 25,
      });

      // Materialize leaderboard
      await leaderboardService.materializeGuild(guildId);

      const buffer = await integratedRenderer.renderFromRepositories(userId, guildId, {
        presenceStatus: 'online',
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      const dims = parseImageDimensions(buffer);
      expect(dims).toEqual({
        width: 1200,
        height: 400,
        format: 'png',
      });
    });
  });
});
