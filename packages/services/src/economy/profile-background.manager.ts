import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { UserRepository } from '@ririko/database';
import type {
  ProfileBackgroundConfig,
  SetBackgroundParams,
  SetBackgroundResult,
  ImageDimensions,
} from './types.js';
import type { InventoryService } from './inventory.service.js';
import { assertPublicUrl, fetchRemoteImage, parseImageDimensions } from '../net/remote-image.js';

interface ResolvedProfileBackgroundConfig {
  maxWidth: number;
  maxHeight: number;
  maxSizeBytes: number;
  timeoutMs: number;
  cacheDir: string;
}

// Canvas-free, so the dashboard can check URLs too; re-exported for existing callers.
export { isPrivateOrRestrictedIp, parseImageDimensions } from '../net/remote-image.js';

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
      cacheDir:
        options?.config?.cacheDir ?? path.resolve(process.cwd(), 'storage/profile-backgrounds'),
    };
  }

  /**
   * Verifies the target URL for DNS SSRF security vulnerabilities.
   * Throws SecurityError if the target resolves to private, loopback, or reserved networks.
   */
  public async validateUrlSecurity(
    urlString: string,
  ): Promise<{ url: URL; resolvedIps: string[] }> {
    return assertPublicUrl(urlString);
  }

  /**
   * Downloads remote image with SSRF verification, size bounding, and MIME type validation.
   */
  public async downloadImage(urlString: string): Promise<{ buffer: Buffer; contentType: string }> {
    return fetchRemoteImage(urlString, {
      maxBytes: this.config.maxSizeBytes,
      timeoutMs: this.config.timeoutMs,
      userAgent: 'RirikoBot/2.0 (+https://ririko.ai; ProfileBackgroundScanner)',
    });
  }

  /**
   * Validates dimensions of an image buffer against the 1200x400 px bounds.
   */
  public validateDimensions(buffer: Buffer): ImageDimensions {
    const dimensions = parseImageDimensions(buffer);
    if (!dimensions) {
      throw new Error(
        'Unable to parse image dimensions. File may be corrupted or in an unsupported format.',
      );
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
          reason:
            'You do not have a Profile Background Voucher in your inventory. Purchase one from /shop buy.',
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

    // Update or create user profile in database
    if (this.userRepository) {
      const existingUser = await this.userRepository.findById(userId);
      if (existingUser) {
        await this.userRepository.update(userId, {
          profileBackgroundUrl: cachedFilePath,
          ...(params.username ? { username: params.username } : {}),
          ...(params.displayName !== undefined ? { displayName: params.displayName } : {}),
          ...(params.avatarUrl !== undefined ? { avatarUrl: params.avatarUrl } : {}),
        });
      } else {
        await this.userRepository.create({
          id: userId,
          username: params.username ?? `user_${userId}`,
          displayName: params.displayName ?? null,
          avatarUrl: params.avatarUrl ?? null,
          profileBackgroundUrl: cachedFilePath,
        });
      }
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
