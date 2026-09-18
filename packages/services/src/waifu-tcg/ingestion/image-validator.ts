import { createHash } from 'node:crypto';
import type { ImageValidationResult } from '../types.js';

export interface ImageValidatorOptions {
  minWidth?: number;
  minHeight?: number;
  minAspectRatio?: number; // width / height
  maxAspectRatio?: number;
}

export class ImageValidator {
  private readonly minWidth: number;
  private readonly minHeight: number;
  private readonly minAspectRatio: number;
  private readonly maxAspectRatio: number;

  constructor(options?: ImageValidatorOptions) {
    this.minWidth = options?.minWidth ?? 400;
    this.minHeight = options?.minHeight ?? 600;
    this.minAspectRatio = options?.minAspectRatio ?? 0.5; // ~1:2
    this.maxAspectRatio = options?.maxAspectRatio ?? 0.9; // ~9:10
  }

  /**
   * Computes SHA-256 hash of binary buffer.
   */
  computeHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Inspects magic bytes and header structure to detect image format.
   */
  detectFormat(buffer: Buffer): 'png' | 'jpeg' | 'webp' | null {
    if (buffer.length < 12) return null;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return 'png';
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'jpeg';
    }

    // WebP: RIFF (bytes 0-3) ... WEBP (bytes 8-11)
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return 'webp';
    }

    return null;
  }

  /**
   * Extracts dimensions from binary buffer for PNG, JPEG, or WebP.
   */
  extractDimensions(
    buffer: Buffer,
    format: 'png' | 'jpeg' | 'webp',
  ): { width: number; height: number } | null {
    try {
      if (format === 'png') {
        if (buffer.length < 24) return null;
        // IHDR chunk starts at byte 12. Width at byte 16, Height at byte 20 (4 bytes Big Endian each).
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }

      if (format === 'jpeg') {
        let offset = 2;
        while (offset < buffer.length) {
          if (buffer[offset] !== 0xff) break;
          const marker = buffer[offset + 1];
          // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2) contain image height and width
          if (
            marker === 0xc0 ||
            marker === 0xc1 ||
            marker === 0xc2 ||
            marker === 0xc3 ||
            marker === 0xc9 ||
            marker === 0xca
          ) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
          }
          const length = buffer.readUInt16BE(offset + 2);
          offset += 2 + length;
        }
        return null;
      }

      if (format === 'webp') {
        if (buffer.length < 30) return null;
        const chunkHeader = buffer.toString('ascii', 12, 16);

        // VP8 (lossy)
        if (chunkHeader === 'VP8 ') {
          const width = buffer.readUInt16LE(26) & 0x3fff;
          const height = buffer.readUInt16LE(28) & 0x3fff;
          return { width, height };
        }

        // VP8L (lossless)
        if (chunkHeader === 'VP8L') {
          const b1 = buffer[21] ?? 0;
          const b2 = buffer[22] ?? 0;
          const b3 = buffer[23] ?? 0;
          const b4 = buffer[24] ?? 0;
          const width = 1 + (((b2 & 0x3f) << 8) | b1);
          const height = 1 + (((b4 & 0xf) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
          return { width, height };
        }

        // VP8X (extended)
        if (chunkHeader === 'VP8X') {
          const width = 1 + buffer.readUIntLE(24, 3);
          const height = 1 + buffer.readUIntLE(27, 3);
          return { width, height };
        }

        return null;
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Validates image buffer conforming to Section 2.1 specifications.
   */
  validate(buffer: Buffer): ImageValidationResult {
    const hash = this.computeHash(buffer);
    const format = this.detectFormat(buffer);

    if (!format) {
      return {
        isValid: false,
        hash,
        error: 'Invalid image format: binary does not match PNG, JPEG, or WebP magic bytes',
      };
    }

    const dimensions = this.extractDimensions(buffer, format);
    if (!dimensions) {
      return {
        isValid: false,
        format,
        hash,
        error: 'Could not decode image dimensions from binary header',
      };
    }

    const { width, height } = dimensions;
    if (width < this.minWidth || height < this.minHeight) {
      return {
        isValid: false,
        format,
        width,
        height,
        hash,
        error: `Dimensions (${width}x${height}) below minimum required (${this.minWidth}x${this.minHeight})`,
      };
    }

    const aspectRatio = width / height;
    if (aspectRatio < this.minAspectRatio || aspectRatio > this.maxAspectRatio) {
      return {
        isValid: false,
        format,
        width,
        height,
        aspectRatio,
        hash,
        error: `Aspect ratio (${aspectRatio.toFixed(2)}) out of card standard range [${this.minAspectRatio}, ${this.maxAspectRatio}]`,
      };
    }

    return {
      isValid: true,
      format,
      width,
      height,
      aspectRatio,
      hash,
    };
  }
}
