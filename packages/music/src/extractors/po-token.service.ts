import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

export interface YouTubePoTokenResult {
  visitorData: string;
  poToken: string;
  mintedAt: number;
}

export interface PoTokenServiceOptions {
  timeoutMs?: number | undefined;
  rotationIntervalMs?: number | undefined;
  initialVisitorData?: string | undefined;
  initialPoToken?: string | undefined;
  onTokenRefreshed?: ((result: YouTubePoTokenResult) => void) | undefined;
}

const require = createRequire(import.meta.url);
let cachedAssets: { domContent: string; baseContent: string; baseAppendContent: string } | null = null;

async function loadAssets(): Promise<{ domContent: string; baseContent: string; baseAppendContent: string }> {
  if (cachedAssets) {
    return cachedAssets;
  }
  const pkgPath = require.resolve('youtube-po-token-generator');
  const pkgDir = path.dirname(pkgPath);
  const [domContent, baseContent, baseAppendContent] = await Promise.all([
    fs.readFile(path.join(pkgDir, 'vendor', 'index.html'), 'utf-8'),
    fs.readFile(path.join(pkgDir, 'vendor', 'base.js'), 'utf-8'),
    fs.readFile(path.join(pkgDir, 'lib', 'inject.js'), 'utf-8'),
  ]);
  cachedAssets = { domContent, baseContent, baseAppendContent };
  return cachedAssets;
}

/**
 * Programmatically generate a genuine YouTube Proof of Origin (poToken)
 * and visitorData by executing the BotGuard player challenge in a secure JSDOM runtime.
 */
export async function generateYouTubePoToken(
  options: { timeoutMs?: number; userAgent?: string } = {}
): Promise<YouTubePoTokenResult> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const userAgent =
    options.userAgent ??
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

  // 1. Fetch current visitorData from YouTube embed HTML
  const visitorRes = await fetch('https://www.youtube.com/embed/dQw4w9WgXcQ', {
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(Math.min(timeoutMs, 5000)),
  });

  if (!visitorRes.ok) {
    throw new Error(`Failed to fetch YouTube embed page: HTTP ${visitorRes.status} ${visitorRes.statusText}`);
  }

  const html = await visitorRes.text();
  const match = html.match(/"visitorData":"([^"]+)"/);
  if (!match || !match[1]) {
    throw new Error('Failed to extract visitorData from YouTube embed HTML');
  }
  const visitorData = match[1];

  // 2. Load YouTube player BotGuard assets
  const { domContent, baseContent, baseAppendContent } = await loadAssets();

  const vc = new VirtualConsole();
  vc.on('error', () => {});
  vc.on('warn', () => {});

  const dom = new JSDOM(domContent, {
    url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
    virtualConsole: vc,
  });

  const win = dom.window as unknown as Record<string, any>;
  Object.defineProperty(win.navigator, 'userAgent', {
    value: userAgent,
    writable: false,
  });
  win.visitorData = visitorData;

  let resolved = false;
  const tokenPromise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          dom.window.close();
        } catch {
          /* ignore */
        }
        reject(new Error(`Timeout waiting for BotGuard PO token (${timeoutMs}ms)`));
      }
    }, timeoutMs);

    win.onPoToken = (token: unknown) => {
      if (resolved || typeof token !== 'string') return;

      // Filter out preliminary placeholder / error tokens (e.g. DFP:Invalid)
      try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        if (decoded.includes('DFP:Invalid') || decoded.includes('Error')) {
          return;
        }
      } catch {
        /* ignore */
      }

      // Valid minted BotGuard token is > 50 characters
      if (token.length > 50) {
        resolved = true;
        clearTimeout(timer);
        try {
          dom.window.close();
        } catch {
          /* ignore */
        }
        resolve(token);
      }
    };
  });

  try {
    const code = baseContent.replace(
      /}\s*\)\(_yt_player\);\s*$/,
      (matched: string) => `;${baseAppendContent};${matched}`
    );
    win.eval(code);
  } catch (evalErr) {
    try {
      dom.window.close();
    } catch {
      /* ignore */
    }
    throw new Error(`Failed to evaluate YouTube BotGuard script: ${(evalErr as Error).message}`, {
      cause: evalErr,
    });
  }

  const poToken = await tokenPromise;
  return {
    visitorData,
    poToken,
    mintedAt: Date.now(),
  };
}

/**
 * In-process service providing cached YouTube Proof of Origin tokens,
 * non-blocking background initialization, and automatic scheduled rotation.
 */
export class PoTokenService {
  private currentResult: YouTubePoTokenResult | null = null;
  private isGenerating = false;
  private rotationTimer: NodeJS.Timeout | null = null;
  private readonly timeoutMs: number;
  private readonly rotationIntervalMs: number;
  private readonly onTokenRefreshed?: ((result: YouTubePoTokenResult) => void) | undefined;

  constructor(options: PoTokenServiceOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.rotationIntervalMs = options.rotationIntervalMs ?? 18 * 60 * 60 * 1000; // 18 hours
    this.onTokenRefreshed = options.onTokenRefreshed;

    if (options.initialPoToken && options.initialVisitorData) {
      this.currentResult = {
        poToken: options.initialPoToken,
        visitorData: options.initialVisitorData,
        mintedAt: Date.now(),
      };
    }
  }

  getCurrentTokens(): YouTubePoTokenResult | null {
    return this.currentResult;
  }

  async getValidTokens(): Promise<YouTubePoTokenResult | null> {
    if (this.currentResult) {
      const age = Date.now() - this.currentResult.mintedAt;
      if (age < this.rotationIntervalMs) {
        return this.currentResult;
      }
    }
    return await this.refreshTokens();
  }

  async refreshTokens(): Promise<YouTubePoTokenResult | null> {
    if (this.isGenerating) {
      return this.currentResult;
    }
    this.isGenerating = true;
    try {
      const result = await generateYouTubePoToken({ timeoutMs: this.timeoutMs });
      this.currentResult = result;
      this.onTokenRefreshed?.(result);
      return result;
    } catch {
      return this.currentResult;
    } finally {
      this.isGenerating = false;
    }
  }

  startAutoRotation(): void {
    if (this.rotationTimer) return;
    this.rotationTimer = setInterval(async () => {
      try {
        await this.refreshTokens();
      } catch {
        /* ignore */
      }
    }, this.rotationIntervalMs);
    this.rotationTimer.unref?.();
  }

  stopAutoRotation(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }
}
