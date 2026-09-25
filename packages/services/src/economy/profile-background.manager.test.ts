import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  ProfileBackgroundManager,
  isPrivateOrRestrictedIp,
  parseImageDimensions,
} from './profile-background.manager.js';
import { SecurityError } from '@ririko/core';
import {
  createDatabaseClient,
  UserRepository,
  ItemRepository,
  InventoryRepository,
  EconomyRepository,
  PlayerEnergyRepository,
  XpRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { EventBus } from '@ririko/core';
import { InventoryService } from './inventory.service.js';
import { LevelingService } from './leveling.service.js';

function createValidPngBuffer(width = 800, height = 300): Buffer {
  const buf = Buffer.alloc(24);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  // IHDR chunk
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function createValidGifBuffer(width = 400, height = 150): Buffer {
  const buf = Buffer.alloc(12);
  buf.write('GIF89a', 0, 'ascii');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

function createValidJpegBuffer(width = 600, height = 200): Buffer {
  const buf = Buffer.alloc(20);
  buf[0] = 0xff;
  buf[1] = 0xd8; // SOI
  buf[2] = 0xff;
  buf[3] = 0xc0; // SOF0
  buf.writeUInt16BE(17, 4); // length
  buf[6] = 8; // precision
  buf.writeUInt16BE(height, 7); // height at offset 7
  buf.writeUInt16BE(width, 9); // width at offset 9
  return buf;
}

function createValidWebpBuffer(width = 1000, height = 350): Buffer {
  const buf = Buffer.alloc(32);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(24, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  buf.writeUInt32LE(10, 16);
  buf.writeUIntLE(width - 1, 24, 3);
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

describe('ProfileBackgroundManager', () => {
  let tempDir: string;
  let client: SqliteDatabaseClient;
  let userRepo: UserRepository;
  let itemRepo: ItemRepository;
  let inventoryRepo: InventoryRepository;
  let economyRepo: EconomyRepository;
  let playerEnergyRepo: PlayerEnergyRepository;
  let xpRepo: XpRepository;
  let levelingService: LevelingService;
  let inventoryService: InventoryService;
  let manager: ProfileBackgroundManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ririko-bg-test-'));

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

      CREATE TABLE economy_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price INTEGER NOT NULL,
        rarity TEXT NOT NULL DEFAULT 'COMMON',
        category_id TEXT,
        icon_url TEXT,
        is_purchasable INTEGER NOT NULL DEFAULT 1,
        metadata TEXT DEFAULT '{}'
      );

      CREATE TABLE economy_inventories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        acquired_at INTEGER NOT NULL
      );

      CREATE TABLE economy_balances (
        user_id TEXT PRIMARY KEY,
        wallet_balance INTEGER NOT NULL DEFAULT 0,
        bank_balance INTEGER NOT NULL DEFAULT 0,
        bank_capacity INTEGER NOT NULL DEFAULT 10000,
        net_worth INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE economy_transactions (
        id TEXT PRIMARY KEY,
        reference_id TEXT,
        guild_id TEXT,
        from_user_id TEXT,
        to_user_id TEXT,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CREDITS',
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE user_levels (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 0,
        total_xp INTEGER NOT NULL DEFAULT 0,
        last_xp_gain_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, guild_id)
      );

      CREATE TABLE player_energy (
        user_id TEXT PRIMARY KEY,
        stamina INTEGER NOT NULL DEFAULT 100,
        max_stamina INTEGER NOT NULL DEFAULT 100,
        daily_energy_pots_used INTEGER NOT NULL DEFAULT 0,
        last_reset_date TEXT NOT NULL,
        last_stamina_regen_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    userRepo = new UserRepository(client);
    itemRepo = new ItemRepository(client);
    inventoryRepo = new InventoryRepository(client);
    economyRepo = new EconomyRepository(client);
    playerEnergyRepo = new PlayerEnergyRepository(client);
    xpRepo = new XpRepository(client);

    const eventBus = new EventBus();
    levelingService = new LevelingService({
      xpRepository: xpRepo,
      userRepository: userRepo,
      eventBus,
    });
    inventoryService = new InventoryService({
      itemRepository: itemRepo,
      inventoryRepository: inventoryRepo,
      economyRepository: economyRepo,
      playerEnergyRepository: playerEnergyRepo,
      levelingService,
      eventBus,
    });

    await itemRepo.seedDefaultCatalog();

    manager = new ProfileBackgroundManager({
      userRepository: userRepo,
      inventoryService,
      config: {
        maxWidth: 1200,
        maxHeight: 400,
        maxSizeBytes: 5 * 1024 * 1024,
        timeoutMs: 3000,
        cacheDir: tempDir,
      },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('isPrivateOrRestrictedIp', () => {
    it('should flag loopback IPs as restricted', () => {
      expect(isPrivateOrRestrictedIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrRestrictedIp('127.1.2.3')).toBe(true);
      expect(isPrivateOrRestrictedIp('::1')).toBe(true);
      expect(isPrivateOrRestrictedIp('::ffff:127.0.0.1')).toBe(true);
    });

    it('should flag private IPv4 networks (RFC 1918) as restricted', () => {
      expect(isPrivateOrRestrictedIp('10.0.0.1')).toBe(true);
      expect(isPrivateOrRestrictedIp('10.254.1.2')).toBe(true);
      expect(isPrivateOrRestrictedIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrRestrictedIp('172.31.255.254')).toBe(true);
      expect(isPrivateOrRestrictedIp('192.168.1.1')).toBe(true);
      expect(isPrivateOrRestrictedIp('192.168.254.254')).toBe(true);
    });

    it('should flag carrier-grade NAT, link-local, multicast and reserved IPs as restricted', () => {
      expect(isPrivateOrRestrictedIp('100.64.0.1')).toBe(true);
      expect(isPrivateOrRestrictedIp('100.127.255.255')).toBe(true);
      expect(isPrivateOrRestrictedIp('169.254.1.1')).toBe(true); // Link-local
      expect(isPrivateOrRestrictedIp('224.0.0.1')).toBe(true); // Multicast
      expect(isPrivateOrRestrictedIp('240.0.0.1')).toBe(true); // Reserved
      expect(isPrivateOrRestrictedIp('0.0.0.0')).toBe(true);
    });

    it('should flag IPv6 private/link-local/multicast as restricted', () => {
      expect(isPrivateOrRestrictedIp('fc00::1')).toBe(true); // ULA
      expect(isPrivateOrRestrictedIp('fd12:3456::1')).toBe(true); // ULA
      expect(isPrivateOrRestrictedIp('fe80::1')).toBe(true); // Link-local
      expect(isPrivateOrRestrictedIp('ff02::1')).toBe(true); // Multicast
      expect(isPrivateOrRestrictedIp('::')).toBe(true);
    });

    it('should allow valid public IP addresses', () => {
      expect(isPrivateOrRestrictedIp('8.8.8.8')).toBe(false);
      expect(isPrivateOrRestrictedIp('1.1.1.1')).toBe(false);
      expect(isPrivateOrRestrictedIp('93.184.216.34')).toBe(false);
      expect(isPrivateOrRestrictedIp('2606:4700:4700::1111')).toBe(false);
    });

    it('should automatically create user record if user does not exist in database yet', async () => {
      vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);

      const testBuffer = createValidPngBuffer(800, 300);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'image/png',
          'content-length': String(testBuffer.length),
        }),
        arrayBuffer: async () =>
          testBuffer.buffer.slice(
            testBuffer.byteOffset,
            testBuffer.byteOffset + testBuffer.byteLength,
          ),
      } as Response);

      const newUserId = '1257377848671600722';
      const result = await manager.setBackground({
        userId: newUserId,
        url: 'https://example.com/fresh_user_bg.png',
        username: 'FreshUser',
        displayName: 'Fresh User',
      });

      expect(result.success).toBe(true);
      const createdUser = await userRepo.findById(newUserId);
      expect(createdUser).not.toBeNull();
      expect(createdUser?.id).toBe(newUserId);
      expect(createdUser?.username).toBe('FreshUser');
      expect(createdUser?.displayName).toBe('Fresh User');
      expect(createdUser?.profileBackgroundUrl).toBe(result.cachedPath);
    });
  });

  describe('parseImageDimensions', () => {
    it('should parse valid PNG dimensions', () => {
      const buf = createValidPngBuffer(800, 300);
      const res = parseImageDimensions(buf);
      expect(res).toEqual({ width: 800, height: 300, format: 'png' });
    });

    it('should parse valid GIF dimensions', () => {
      const buf = createValidGifBuffer(400, 150);
      const res = parseImageDimensions(buf);
      expect(res).toEqual({ width: 400, height: 150, format: 'gif' });
    });

    it('should parse valid JPEG dimensions', () => {
      const buf = createValidJpegBuffer(600, 200);
      const res = parseImageDimensions(buf);
      expect(res).toEqual({ width: 600, height: 200, format: 'jpeg' });
    });

    it('should parse valid WebP dimensions', () => {
      const buf = createValidWebpBuffer(1000, 350);
      const res = parseImageDimensions(buf);
      expect(res).toEqual({ width: 1000, height: 350, format: 'webp' });
    });

    it('should return null for truncated or invalid binary headers', () => {
      expect(parseImageDimensions(Buffer.from('not an image'))).toBeNull();
      expect(parseImageDimensions(Buffer.alloc(8))).toBeNull();
    });
  });

  describe('validateUrlSecurity', () => {
    it('should reject invalid URL strings', async () => {
      await expect(manager.validateUrlSecurity('not-a-valid-url')).rejects.toThrow(SecurityError);
    });

    it('should reject non-HTTP/HTTPS schemes', async () => {
      await expect(manager.validateUrlSecurity('ftp://cdn.example.com/bg.png')).rejects.toThrow(
        /Unsupported protocol/,
      );
      await expect(manager.validateUrlSecurity('file:///etc/passwd')).rejects.toThrow(
        /Unsupported protocol/,
      );
    });

    it('should reject localhost and internal hostnames directly', async () => {
      await expect(manager.validateUrlSecurity('http://localhost/bg.png')).rejects.toThrow(
        /SSRF_ATTEMPT_DETECTED/,
      );
      await expect(manager.validateUrlSecurity('http://127.0.0.1/bg.png')).rejects.toThrow(
        /SSRF_ATTEMPT_DETECTED/,
      );
      await expect(manager.validateUrlSecurity('http://service.internal/bg.png')).rejects.toThrow(
        /SSRF_ATTEMPT_DETECTED/,
      );
      await expect(manager.validateUrlSecurity('http://myhost.local/bg.png')).rejects.toThrow(
        /SSRF_ATTEMPT_DETECTED/,
      );
    });

    it('should reject hostnames that resolve via DNS to private or loopback IPs', async () => {
      vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '192.168.1.50', family: 4 }] as never);

      await expect(
        manager.validateUrlSecurity('https://attacker-domain.com/image.png'),
      ).rejects.toThrow(/SSRF_ATTEMPT_DETECTED/);
    });

    it('should accept hostnames resolving to public IPs', async () => {
      vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);

      const res = await manager.validateUrlSecurity('https://example.com/image.png');
      expect(res.resolvedIps).toEqual(['93.184.216.34']);
      expect(res.url.hostname).toBe('example.com');
    });
  });

  describe('validateDimensions', () => {
    it('should accept images within 1200x400 limit', () => {
      const buf = createValidPngBuffer(1200, 400);
      const dims = manager.validateDimensions(buf);
      expect(dims).toEqual({ width: 1200, height: 400, format: 'png' });
    });

    it('should reject images with width exceeding 1200px', () => {
      const buf = createValidPngBuffer(1201, 300);
      expect(() => manager.validateDimensions(buf)).toThrow(
        /exceed maximum allowable bounds of 1200x400px/,
      );
    });

    it('should reject images with height exceeding 400px', () => {
      const buf = createValidPngBuffer(800, 401);
      expect(() => manager.validateDimensions(buf)).toThrow(
        /exceed maximum allowable bounds of 1200x400px/,
      );
    });
  });

  describe('downloadImage', () => {
    it('should download and return buffer for valid response', async () => {
      vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);

      const testBuffer = createValidPngBuffer(800, 300);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'image/png',
          'content-length': String(testBuffer.length),
        }),
        arrayBuffer: async () =>
          testBuffer.buffer.slice(
            testBuffer.byteOffset,
            testBuffer.byteOffset + testBuffer.byteLength,
          ),
      } as Response);

      const res = await manager.downloadImage('https://example.com/profile-bg.png');
      expect(res.contentType).toBe('image/png');
      expect(res.buffer.length).toBe(testBuffer.length);
    });

    it('should reject non-image content-type', async () => {
      vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'text/html',
        }),
      } as Response);

      await expect(manager.downloadImage('https://example.com/fake.png')).rejects.toThrow(
        /Invalid content type/,
      );
    });

    it('should reject images exceeding max file size limit (5MB)', async () => {
      vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'image/png',
          'content-length': String(6 * 1024 * 1024), // 6MB
        }),
      } as Response);

      await expect(manager.downloadImage('https://example.com/large.png')).rejects.toThrow(
        /exceeds maximum limit of 5242880 bytes/,
      );
    });
  });

  describe('setBackground', () => {
    const userId = 'user_bg_01';

    beforeEach(async () => {
      await userRepo.create({
        id: userId,
        username: 'BackgroundTester',
        displayName: 'Background Tester',
        notifyLevelUp: true,
      });
    });

    it('should successfully validate, download, cache and set background in database', async () => {
      vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);

      const testBuffer = createValidPngBuffer(800, 300);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'image/png',
          'content-length': String(testBuffer.length),
        }),
        arrayBuffer: async () =>
          testBuffer.buffer.slice(
            testBuffer.byteOffset,
            testBuffer.byteOffset + testBuffer.byteLength,
          ),
      } as Response);

      const result = await manager.setBackground({
        userId,
        url: 'https://example.com/custom_bg.png',
      });

      expect(result.success).toBe(true);
      expect(result.dimensions).toEqual({ width: 800, height: 300 });
      expect(result.format).toBe('png');
      expect(result.cachedPath).toBeDefined();

      // Check file exists on disk
      const fileExists = await fs
        .access(result.cachedPath!)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Verify user record in database was updated
      const updatedUser = await userRepo.findById(userId);
      expect(updatedUser?.profileBackgroundUrl).toBe(result.cachedPath);
    });

    it('should consume voucher when consumeToken is requested and user has voucher', async () => {
      vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);

      const testBuffer = createValidPngBuffer(600, 250);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'image/png',
          'content-length': String(testBuffer.length),
        }),
        arrayBuffer: async () =>
          testBuffer.buffer.slice(
            testBuffer.byteOffset,
            testBuffer.byteOffset + testBuffer.byteLength,
          ),
      } as Response);

      // Add voucher to user inventory
      await inventoryRepo.addItem(userId, 'profile_bg_voucher', 1);
      const qtyBefore = await inventoryService.getItemQuantity(userId, 'profile_bg_voucher');
      expect(qtyBefore).toBe(1);

      const result = await manager.setBackground({
        userId,
        url: 'https://example.com/voucher_bg.png',
        consumeToken: true,
      });

      expect(result.success).toBe(true);

      // Voucher should now be consumed
      const qtyAfter = await inventoryService.getItemQuantity(userId, 'profile_bg_voucher');
      expect(qtyAfter).toBe(0);
    });

    it('should fail with reason when consumeToken is requested but user has no voucher', async () => {
      const result = await manager.setBackground({
        userId,
        url: 'https://example.com/unauthorized.png',
        consumeToken: true,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('You do not have a Profile Background Voucher');

      // User record should remain unchanged
      const user = await userRepo.findById(userId);
      expect(user?.profileBackgroundUrl).toBeNull();
    });

    it('should fail gracefully if remote image download fails', async () => {
      vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      } as Response);

      const result = await manager.setBackground({
        userId,
        url: 'https://example.com/not_found.png',
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('HTTP 404');
    });
  });
});
