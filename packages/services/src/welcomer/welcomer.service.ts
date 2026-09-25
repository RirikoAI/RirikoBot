import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { promises as dns } from 'node:dns';
import { isIPv4, isIPv6 } from 'node:net';

export interface WelcomerCardOptions {
  userTag: string;
  avatarUrl: string;
  memberCount: number;
  serverName: string;
  messageText: string;
  backgroundUrl?: string | null;
  textColor?: string;
  isFarewell?: boolean;
}

export class WelcomerService {
  constructor() {}

  /**
   * Validates a URL against SSRF attacks by resolving its IP address
   * and ensuring it is not a private or loopback address.
   */
  public async validateBackgroundUrl(urlStr: string): Promise<boolean> {
    if (!urlStr) return false;

    let url: URL;
    try {
      url = new URL(urlStr);
    } catch {
      return false;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    try {
      const addresses = await dns.resolve(url.hostname);
      if (!addresses || addresses.length === 0) return false;

      for (const ip of addresses) {
        if (this.isPrivateIp(ip)) {
          return false;
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  private isPrivateIp(ip: string): boolean {
    if (isIPv4(ip)) {
      const parts = ip.split('.').map((p) => parseInt(p, 10));
      // 10.0.0.0/8
      if (parts[0] === 10) return true;
      // 172.16.0.0/12
      if (parts[0] === 172 && parts[1] !== undefined && parts[1] >= 16 && parts[1] <= 31)
        return true;
      // 192.168.0.0/16
      if (parts[0] === 192 && parts[1] === 168) return true;
      // 127.0.0.0/8 (Loopback)
      if (parts[0] === 127) return true;
      // 169.254.0.0/16 (Link-local)
      if (parts[0] === 169 && parts[1] === 254) return true;
      // 0.0.0.0/8
      if (parts[0] === 0) return true;
      return false;
    }

    if (isIPv6(ip)) {
      const lower = ip.toLowerCase();
      // ::1 loopback
      if (lower === '::1') return true;
      // fd00::/8 Unique Local
      if (lower.startsWith('fd') || lower.startsWith('fc')) return true;
      // fe80::/10 Link Local
      if (
        lower.startsWith('fe8') ||
        lower.startsWith('fe9') ||
        lower.startsWith('fea') ||
        lower.startsWith('feb')
      )
        return true;
      return false;
    }
    return true; // If not valid IPv4 or IPv6, consider it unsafe
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

    if (options.backgroundUrl && (await this.validateBackgroundUrl(options.backgroundUrl))) {
      try {
        const bg = await loadImage(options.backgroundUrl);
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
    );

    // Message Text
    ctx.font = '32px sans-serif';
    ctx.fillStyle = textColor;
    // Replace placeholders just in case they weren't replaced beforehand, though normally the caller handles this
    const msg = options.messageText
      .replace('{user}', options.userTag)
      .replace('{server}', options.serverName)
      .replace('{memberCount}', options.memberCount.toString());

    ctx.fillText(msg, width / 2, 380);

    return canvas.toBuffer('image/png');
  }
}
