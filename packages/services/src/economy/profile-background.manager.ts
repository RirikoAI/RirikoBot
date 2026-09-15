import dns from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { UserRepository } from '@ririko/database';
import { SecurityError } from '@ririko/core';
import type {
  ProfileBackgroundConfig,
  SetBackgroundParams,
  SetBackgroundResult,
  ImageDimensions,
} from './types.js';
import type { InventoryService } from './inventory.service.js';

interface ResolvedProfileBackgroundConfig {
  maxWidth: number;
  maxHeight: number;
  maxSizeBytes: number;
  timeoutMs: number;
  cacheDir: string;
}

/**
 * Checks whether an IP address belongs to private, loopback, link-local, or reserved ranges.
 */
export function isPrivateOrRestrictedIp(ip: string): boolean {
  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1)
  let cleanIp = ip.trim().toLowerCase();
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.slice(7);
  }

  // IPv4 Checks
  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.').map((p) => Number.parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
      return true; // Invalid format treated as restricted
    }

    const [a, b] = parts as [number, number, number, number];

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private network)
    if (a === 10) return true;
    // 100.64.0.0/10 (Shared address space / Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private network)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && parts[2] === 2) return true;
    // 192.168.0.0/16 (Private network)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Network benchmark tests)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && parts[2] === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && parts[2] === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (a >= 240) return true;

    return false;
  }

  // IPv6 Checks
  if (cleanIp === '::' || cleanIp === '::1') return true; // Unspecified or Loopback
  if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true; // Unique Local Address (fc00::/7)
  if (cleanIp.startsWith('fe80:')) return true; // Link-local unicast (fe80::/10)
  if (cleanIp.startsWith('ff')) return true; // Multicast (ff00::/8)

  return false;
}

/**
 * Parses image dimensions and format directly from binary header buffer.
 * Supports PNG, JPEG, GIF, and WebP without native build dependencies.
 */
export function parseImageDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 10) return null;

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer.length >= 24
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height, format: 'png' };
  }

  // 2. GIF: GIF87a or GIF89a
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer.length >= 10
  ) {
    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    return { width, height, format: 'gif' };
  }

  // 3. WebP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.length >= 30 &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const chunkHeader = buffer.toString('ascii', 12, 16);
    if (chunkHeader === 'VP8 ' && buffer.length >= 30) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      return { width, height, format: 'webp' };
    }
    if (chunkHeader === 'VP8L' && buffer.length >= 25) {
      const b1 = buffer[21] ?? 0;
      const b2 = buffer[22] ?? 0;
      const b3 = buffer[23] ?? 0;
      const b4 = buffer[24] ?? 0;
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      return { width, height, format: 'webp' };
    }
    if (chunkHeader === 'VP8X' && buffer.length >= 30) {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      return { width, height, format: 'webp' };
    }
  }

  // 4. JPEG: FF D8 ...
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === undefined) break;

      // Start of Frame markers containing dimensions
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        if (offset + 9 <= buffer.length) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height, format: 'jpeg' };
        }
      }

      if (marker === 0xd9 || marker === 0xda) {
        // End of image or start of scan
        break;
      }

      if (offset + 4 <= buffer.length) {
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      } else {
        break;
      }
    }
  }

  return null;
}

export interface ProfileBackgroundManagerOptions {
  userRepository?: UserRepository | undefined;
  inventoryService?: InventoryService | undefined;
  config?: ProfileBackgroundConfig | undefined;
}

/**
 * Profile Background Manager implementing Section 33 of BLUEPRINT.md and Section 6.2 of docs/economy.md:
 * - Anti-SSRF hostname resolution and private/reserved IP blocking.
 * - HTTP safe image download with size limits.
 * - Exact dimension scanning with 1200x400 px hard bounds.
 * - Local filesystem caching to eliminate broken remote URLs.
 * - User profile background URL synchronization and optional shop voucher consumption.
 */
export class ProfileBackgroundManager {
  private readonly userRepository?: UserRepository | undefined;
  private readonly inventoryService?: InventoryService | undefined;
  private readonly config: ResolvedProfileBackgroundConfig;

  constructor(options?: ProfileBackgroundManagerOptions) {
    this.userRepository = options?.userRepository;
    this.inventoryService = options?.inventoryService;
    this.config = {
      maxWidth: options?.config?.maxWidth ?? 1200,
      maxHeight: options?.config?.maxHeight ?? 400,
      maxSizeBytes: options?.config?.maxSizeBytes ?? 5 * 1024 * 1024, // 5MB
      timeoutMs: options?.config?.timeoutMs ?? 10000,
      cacheDir: options?.config?.cacheDir ?? path.resolve(process.cwd(), 'storage/profile-backgrounds'),
    };
  }

  /**
   * Verifies the target URL for DNS SSRF security vulnerabilities.
   * Throws SecurityError if the target resolves to private, loopback, or reserved networks.
   */
  public async validateUrlSecurity(urlString: string): Promise<{ url: URL; resolvedIps: string[] }> {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlString);
    } catch {
      throw new SecurityError('Invalid profile background URL format');
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new SecurityError(`Unsupported protocol "${parsedUrl.protocol}". Only HTTP and HTTPS are allowed.`);
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // Check direct localhost / loopback names
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      throw new SecurityError(`SSRF_ATTEMPT_DETECTED: Target hostname "${hostname}" is a restricted local address.`);
    }

    // Perform DNS lookup to inspect all resolved IPs
    let lookupResults: LookupAddress[];
    try {
      lookupResults = await dns.lookup(hostname, { all: true });
    } catch (err: unknown) {
      throw new SecurityError(`Failed to resolve DNS for hostname "${hostname}": ${err instanceof Error ? err.message : String(err)}`);
    }

    if (lookupResults.length === 0) {
      throw new SecurityError(`No IP addresses found for hostname "${hostname}".`);
    }

    const resolvedIps = lookupResults.map((r) => r.address);
    for (const ip of resolvedIps) {
      if (isPrivateOrRestrictedIp(ip)) {
        throw new SecurityError(
          `SSRF_ATTEMPT_DETECTED: Target hostname "${hostname}" resolves to private or restricted network address (${ip}).`,
        );
      }
    }

    return { url: parsedUrl, resolvedIps };
  }

  /**
   * Downloads remote image with SSRF verification, size bounding, and MIME type validation.
   */
  public async downloadImage(urlString: string): Promise<{ buffer: Buffer; contentType: string }> {
    await this.validateUrlSecurity(urlString);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(urlString, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'RirikoBot/2.0 (+https://ririko.ai; ProfileBackgroundScanner)',
          Accept: 'image/png,image/jpeg,image/webp,image/gif',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to download image from server (HTTP ${response.status}: ${response.statusText})`);
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (
        !contentType.startsWith('image/') ||
        (!contentType.includes('png') &&
          !contentType.includes('jpeg') &&
          !contentType.includes('jpg') &&
          !contentType.includes('webp') &&
          !contentType.includes('gif'))
      ) {
        throw new Error(`Invalid content type "${contentType}". Only PNG, JPEG, WebP, and GIF images are permitted.`);
      }

      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const declaredSize = Number.parseInt(contentLengthHeader, 10);
        if (!Number.isNaN(declaredSize) && declaredSize > this.config.maxSizeBytes) {
          throw new Error(
            `Image size (${declaredSize} bytes) exceeds maximum limit of ${this.config.maxSizeBytes} bytes (5MB).`,
          );
        }
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length > this.config.maxSizeBytes) {
        throw new Error(
          `Downloaded image size (${buffer.length} bytes) exceeds maximum limit of ${this.config.maxSizeBytes} bytes (5MB).`,
        );
      }

      return { buffer, contentType };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Validates dimensions of an image buffer against the 1200x400 px bounds.
   */
  public validateDimensions(buffer: Buffer): ImageDimensions {
    const dimensions = parseImageDimensions(buffer);
    if (!dimensions) {
      throw new Error('Unable to parse image dimensions. File may be corrupted or in an unsupported format.');
    }

    if (dimensions.width > this.config.maxWidth || dimensions.height > this.config.maxHeight) {
      throw new Error(
        `Image dimensions (${dimensions.width}x${dimensions.height}px) exceed maximum allowable bounds of ${this.config.maxWidth}x${this.config.maxHeight}px.`,
      );
    }

    return dimensions;
  }

  /**
   * Validates, downloads, checks dimensions, caches locally, and sets the profile background for a user.
   */
  public async setBackground(params: SetBackgroundParams): Promise<SetBackgroundResult> {
    const { userId, url, consumeToken } = params;

    // Optional voucher check & deduction
    if (consumeToken && this.inventoryService) {
      const voucherQty = await this.inventoryService.getItemQuantity(userId, 'profile_bg_voucher');
      if (voucherQty <= 0) {
        return {
          success: false,
          reason: 'You do not have a Profile Background Voucher in your inventory. Purchase one from /shop buy.',
        };
      }
    }

    let buffer: Buffer;
    try {
      const downloadRes = await this.downloadImage(url);
      buffer = downloadRes.buffer;
    } catch (err: unknown) {
      return {
        success: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    let dimensions: ImageDimensions;
    try {
      dimensions = this.validateDimensions(buffer);
    } catch (err: unknown) {
      return {
        success: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    // Consume the voucher if verified
    if (consumeToken && this.inventoryService) {
      const useRes = await this.inventoryService.useItem({
        userId,
        itemId: 'profile_bg_voucher',
        quantity: 1,
      });
      if (!useRes.success) {
        return {
          success: false,
          reason: useRes.reason ?? 'Failed to consume Profile Background Voucher',
        };
      }
    }

    // Save to local cache directory to prevent dead URLs
    await fs.mkdir(this.config.cacheDir, { recursive: true });
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const filename = `${userId}_${hash}.${dimensions.format}`;
    const cachedFilePath = path.join(this.config.cacheDir, filename);

    await fs.writeFile(cachedFilePath, buffer);

    // Update user profile in database
    if (this.userRepository) {
      await this.userRepository.update(userId, {
        profileBackgroundUrl: cachedFilePath,
      });
    }

    return {
      success: true,
      cachedPath: cachedFilePath,
      dimensions: {
        width: dimensions.width,
        height: dimensions.height,
      },
      format: dimensions.format,
      fileSizeBytes: buffer.length,
    };
  }
}
