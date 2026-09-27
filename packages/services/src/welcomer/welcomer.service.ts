import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fetchRemoteImage } from '../net/remote-image.js';
import { WelcomerBackgroundStore } from './background-store.js';

export interface WelcomerCardOptions {
  userTag: string;
  avatarUrl: string;
  memberCount: number;
  serverName: string;
  messageText: string;
  /** Image bytes from `loadBackground`; null or absent draws the default gradient. */
  background?: Buffer | null | undefined;
  textColor?: string;
  isFarewell?: boolean;
}

/** Where a card's background comes from: an uploaded file or a public link, never both. */
export interface WelcomerBackgroundSource {
  backgroundUrl: string | null;
  backgroundFile: string | null;
}

/** Largest background image fetched from a link. */
const MAX_BACKGROUND_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const BACKGROUND_TIMEOUT_MS = 5000;

/** Replaces {user}, {server} and {memberCount} everywhere in a card message. */
export function fillWelcomerMessage(
  template: string,
  values: { userTag: string; serverName: string; memberCount: number },
): string {
  return template.replace(/\{(user|server|memberCount)\}/g, (_match, name: string) =>
    name === 'user'
      ? values.userTag
      : name === 'server'
        ? values.serverName
        : values.memberCount.toString(),
  );
}

export class WelcomerService {
  constructor(readonly backgrounds: WelcomerBackgroundStore = new WelcomerBackgroundStore()) {}

  /**
   * The background bytes for a card: the uploaded file, or the image behind the link fetched
   * through `fetchRemoteImage` (public addresses only, redirects checked, size capped). Null
   * when there is none or it cannot be loaded; the card then uses the default background.
   */
  async loadBackground(
    source: WelcomerBackgroundSource | null | undefined,
  ): Promise<Buffer | null> {
    if (source?.backgroundFile) return this.backgrounds.read(source.backgroundFile);
    if (!source?.backgroundUrl) return null;
    try {
      const { buffer } = await fetchRemoteImage(source.backgroundUrl, {
        maxBytes: MAX_BACKGROUND_DOWNLOAD_BYTES,
        timeoutMs: BACKGROUND_TIMEOUT_MS,
      });
      return buffer;
    } catch {
      return null;
    }
  }

  public async renderCard(options: WelcomerCardOptions): Promise<Buffer> {
    const width = 1000;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const textColor = options.textColor || '#ffffff';

    // 1. Background
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(0, 0, width, height);

    if (options.background) {
      try {
        const bg = await loadImage(options.background);
        // Draw cover
        const bgRatio = bg.width / bg.height;
        const canvasRatio = width / height;
        let drawWidth = width;
        let drawHeight = height;
        let offsetX = 0;
        let offsetY = 0;

        if (bgRatio > canvasRatio) {
          drawWidth = height * bgRatio;
          offsetX = (width - drawWidth) / 2;
        } else {
          drawHeight = width / bgRatio;
          offsetY = (height - drawHeight) / 2;
        }

        ctx.drawImage(bg, offsetX, offsetY, drawWidth, drawHeight);

        // Add a dark overlay to ensure text is readable
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, width, height);
      } catch (e) {
        // Fallback to solid background if image fails to load
        ctx.fillStyle = '#1e1e2e';
        ctx.fillRect(0, 0, width, height);
      }
    } else {
      // Fancy default background if no custom background
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#2b2d42');
      gradient.addColorStop(1, '#8d99ae');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    // Add border
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, width, height);

    // 2. Avatar
    const avatarSize = 256;
    const avatarX = width / 2 - avatarSize / 2;
    const avatarY = 40;

    ctx.save();
    ctx.beginPath();
    ctx.arc(
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2,
      avatarSize / 2,
      0,
      Math.PI * 2,
      true,
    );
    ctx.closePath();
    ctx.clip();

    try {
      const avatar = await loadImage(options.avatarUrl);
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    } catch {
      ctx.fillStyle = '#454545';
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }

    ctx.lineWidth = 8;
    ctx.strokeStyle = textColor;
    ctx.stroke();
    ctx.restore();

    // 3. Main Text
    ctx.textAlign = 'center';

    // Welcome / Goodbye User Tag
    ctx.font = 'bold 48px sans-serif';
    ctx.fillStyle = textColor;
    ctx.fillText(
      `${options.isFarewell ? 'Goodbye' : 'Welcome'} ${options.userTag}`,
      width / 2,
      340,
      width - 60,
    );

    // Message Text, shrunk until it fits on the card
    ctx.fillStyle = textColor;
    const msg = fillWelcomerMessage(options.messageText, options);
    let fontSize = 32;
    ctx.font = `${fontSize}px sans-serif`;
    while (fontSize > 14 && ctx.measureText(msg).width > width - 60) {
      fontSize -= 2;
      ctx.font = `${fontSize}px sans-serif`;
    }

    ctx.fillText(msg, width / 2, 380, width - 60);

    return canvas.toBuffer('image/png');
  }
}
