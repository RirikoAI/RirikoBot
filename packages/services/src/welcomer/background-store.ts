import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  MAX_BACKGROUND_UPLOAD_BYTES,
  MAX_BACKGROUND_UPLOAD_SIDE,
  resolveWorkspacePath,
  type WelcomerCardKind,
} from '@ririko/core';
import { parseImageDimensions } from '../net/remote-image.js';

/**
 * Where uploaded welcome and farewell backgrounds live, relative to the workspace root. The bot
 * and the dashboard both read and write it, so in Docker it is a volume mounted in both.
 */
export const WELCOMER_BACKGROUND_DIR = 'storage/welcomer-backgrounds';

/** `<guildId>_<kind>_<16 hex of the content hash>.<format>`, the only names ever read. */
const FILE_NAME = /^(\d{17,20})_(welcome|farewell)_[0-9a-f]{16}\.(png|jpeg|webp|gif)$/;

/** An upload the rules refuse; the message is for the user. */
export class BackgroundUploadError extends Error {}

/**
 * Uploaded card backgrounds. Files are named by guild, card and content hash, and only names
 * of that shape are read or deleted, so a stored name cannot point outside the directory.
 */
export class WelcomerBackgroundStore {
  private readonly dir: string;

  constructor(dir: string = resolveWorkspacePath(WELCOMER_BACKGROUND_DIR)) {
    this.dir = dir;
  }

  /**
   * Checks an upload (size, PNG/JPEG/WebP/GIF by its bytes, dimensions) and writes it.
   * Returns the file name to store; the file type is taken from the bytes, never the upload.
   */
  async save(guildId: string, kind: WelcomerCardKind, buffer: Buffer): Promise<string> {
    if (!/^\d{17,20}$/.test(guildId)) throw new BackgroundUploadError('Unknown server.');
    if (buffer.length === 0) throw new BackgroundUploadError('Choose an image to upload.');
    if (buffer.length > MAX_BACKGROUND_UPLOAD_BYTES) {
      throw new BackgroundUploadError(
        `The image is larger than ${MAX_BACKGROUND_UPLOAD_BYTES / (1024 * 1024)} MB.`,
      );
    }
    const dimensions = parseImageDimensions(buffer);
    if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
      throw new BackgroundUploadError('Upload a PNG, JPEG, WebP or GIF image.');
    }
    if (
      dimensions.width > MAX_BACKGROUND_UPLOAD_SIDE ||
      dimensions.height > MAX_BACKGROUND_UPLOAD_SIDE
    ) {
      throw new BackgroundUploadError(
        `The image is ${dimensions.width}×${dimensions.height} pixels; use at most ${MAX_BACKGROUND_UPLOAD_SIDE} on each side.`,
      );
    }

    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const fileName = `${guildId}_${kind}_${hash}.${dimensions.format}`;
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(path.join(this.dir, fileName), buffer);
    return fileName;
  }

  /** The stored image, or null when the name is not one this store writes or the file is gone. */
  async read(fileName: string): Promise<Buffer | null> {
    if (!FILE_NAME.test(fileName)) return null;
    try {
      return await fs.readFile(path.join(this.dir, fileName));
    } catch {
      return null;
    }
  }

  /** Deletes the guild's other uploads for this card, keeping `keep` (the one in use). */
  async prune(guildId: string, kind: WelcomerCardKind, keep: string | null): Promise<void> {
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return;
    }
    await Promise.all(
      names
        .filter((name) => {
          const match = FILE_NAME.exec(name);
          return match?.[1] === guildId && match[2] === kind && name !== keep;
        })
        .map((name) => fs.rm(path.join(this.dir, name), { force: true })),
    );
  }
}
