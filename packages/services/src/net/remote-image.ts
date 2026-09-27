import dns from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { SecurityError } from '@ririko/core';
import type { ImageDimensions } from '../economy/types.js';

/** Redirects followed by `fetchRemoteImage`; each target is checked like the first URL. */
const MAX_REDIRECTS = 3;

const IMAGE_TYPES = ['png', 'jpeg', 'jpg', 'webp', 'gif'];

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

    const [a, b, c] = parts as [number, number, number, number];

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
    // 192.0.0.0/24 (IETF Protocol Assignments) and 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    // 192.168.0.0/16 (Private network)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Network benchmark tests)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (a >= 240) return true;

    return false;
  }

  // IPv6 Checks
  if (cleanIp === '::' || cleanIp === '::1') return true; // Unspecified or Loopback
  if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true; // Unique Local Address (fc00::/7)
  if (/^fe[89ab]/.test(cleanIp)) return true; // Link-local unicast (fe80::/10)
  if (cleanIp.startsWith('ff')) return true; // Multicast (ff00::/8)

  return false;
}

/**
 * Checks a URL before the server fetches it: http or https only, not a local name, and every
 * address the name resolves to is public. Throws `SecurityError` otherwise.
 */
export async function assertPublicUrl(
  urlString: string,
): Promise<{ url: URL; resolvedIps: string[] }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    throw new SecurityError('Invalid image URL format');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new SecurityError(
      `Unsupported protocol "${parsedUrl.protocol}". Only HTTP and HTTPS are allowed.`,
    );
  }

  // IPv6 literals keep their brackets in `hostname`.
  const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new SecurityError(
      `SSRF_ATTEMPT_DETECTED: Target hostname "${hostname}" is a restricted local address.`,
    );
  }

  let lookupResults: LookupAddress[];
  try {
    lookupResults = await dns.lookup(hostname, { all: true });
  } catch (err: unknown) {
    throw new SecurityError(
      `Failed to resolve DNS for hostname "${hostname}": ${err instanceof Error ? err.message : String(err)}`,
    );
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

export interface FetchRemoteImageOptions {
  maxBytes: number;
  timeoutMs: number;
  userAgent?: string;
}

/**
 * Downloads an image from a public URL. The URL and every redirect target pass
 * `assertPublicUrl` first; redirects are followed by hand so none can lead to a private
 * address. The content type must be PNG, JPEG, WebP or GIF, and the body at most `maxBytes`.
 */
export async function fetchRemoteImage(
  urlString: string,
  options: FetchRemoteImageOptions,
): Promise<{ buffer: Buffer; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    let current = urlString;
    for (let redirects = 0; ; redirects++) {
      await assertPublicUrl(current);
      const response = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': options.userAgent ?? 'RirikoBot/2.0 (+https://ririko.ai)',
          Accept: 'image/png,image/jpeg,image/webp,image/gif',
        },
      });

      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        if (redirects >= MAX_REDIRECTS) throw new Error('The image URL redirects too many times.');
        current = new URL(location, current).toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `Failed to download image from server (HTTP ${response.status}: ${response.statusText})`,
        );
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.startsWith('image/') || !IMAGE_TYPES.some((t) => contentType.includes(t))) {
        throw new Error(
          `Invalid content type "${contentType}". Only PNG, JPEG, WebP, and GIF images are permitted.`,
        );
      }

      const declaredSize = Number.parseInt(response.headers.get('content-length') ?? '', 10);
      if (!Number.isNaN(declaredSize) && declaredSize > options.maxBytes) {
        throw new Error(
          `Image size (${declaredSize} bytes) exceeds maximum limit of ${options.maxBytes} bytes.`,
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > options.maxBytes) {
        throw new Error(
          `Downloaded image size (${buffer.length} bytes) exceeds maximum limit of ${options.maxBytes} bytes.`,
        );
      }

      return { buffer, contentType };
    }
  } finally {
    clearTimeout(timeout);
  }
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
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer.length >= 10) {
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
