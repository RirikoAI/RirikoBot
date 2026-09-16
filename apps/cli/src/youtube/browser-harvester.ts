import * as readline from 'node:readline';
import { generateYouTubePoToken } from '@ririko/music';
import pc from 'picocolors';
import { chromium, firefox, type Browser } from 'playwright';

export type SupportedBrowser = 'chrome' | 'chromium' | 'firefox';

export interface BrowserHarvesterOptions {
  browser?: SupportedBrowser | undefined;
  login?: boolean | undefined;
  timeoutMs?: number | undefined;
  onProgress?: ((message: string) => void) | undefined;
}

export interface BrowserHarvesterResult {
  cookies: string;
  cookieCount: number;
  poToken: string;
  visitorData: string;
  userAgent: string;
  isAuthenticated: boolean;
  browserUsed: string;
}

async function launchBrowser(
  browserType: SupportedBrowser,
  isHeaded: boolean,
  logProgress: (msg: string) => void
): Promise<{ browser: Browser; browserName: string }> {
  if (browserType === 'firefox') {
    logProgress(`Launching Firefox browser (${isHeaded ? 'interactive window' : 'headless'})...`);
    const browser = await firefox.launch({
      headless: !isHeaded,
    });
    return { browser, browserName: 'Firefox' };
  }

  // Chrome / Chromium (default & recommended)
  const chromeArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-infobars',
  ];

  if (browserType === 'chrome') {
    try {
      logProgress(`Launching Google Chrome (${isHeaded ? 'interactive window' : 'headless'})...`);
      const browser = await chromium.launch({
        channel: 'chrome',
        headless: !isHeaded,
        args: chromeArgs,
      });
      return { browser, browserName: 'Google Chrome' };
    } catch {
      logProgress('System Google Chrome not found, falling back to bundled Chromium...');
    }
  }

  logProgress(`Launching Chromium browser (${isHeaded ? 'interactive window' : 'headless'})...`);
  const browser = await chromium.launch({
    headless: !isHeaded,
    args: chromeArgs,
  });
  return { browser, browserName: 'Chromium' };
}

/**
 * Launches real browser (Chrome by default, or Firefox) using Playwright to extract
 * YouTube cookies, user-agent fingerprint, visitor context, and matching BotGuard Proof of Origin token.
 */
export async function harvestYouTubeBrowserSession(
  options: BrowserHarvesterOptions = {}
): Promise<BrowserHarvesterResult> {
  const isHeaded = Boolean(options.login);
  const browserType: SupportedBrowser = options.browser ?? 'chrome';

  const logProgress = (msg: string) => {
    if (options.onProgress) {
      options.onProgress(msg);
    } else {
      console.log(pc.cyan(`  ${msg}`));
    }
  };

  const { browser, browserName } = await launchBrowser(browserType, isHeaded, logProgress);

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
    });

    const page = await context.newPage();

    // Anti-automation: conceal navigator.webdriver so Google allows authentication
    await page.addInitScript(() => {
      try {
        const nav = (globalThis as unknown as Record<string, any>)['navigator'];
        if (nav) {
          Object.defineProperty(nav, 'webdriver', { get: () => undefined });
        }
      } catch {}
    });

    if (isHeaded) {
      logProgress('Navigating to YouTube Sign-In page...');
      await page.goto(
        'https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/',
        { waitUntil: 'domcontentloaded' }
      );

      console.log(pc.bold(pc.yellow('\n  🔑 Browser opened. Please sign in to your YouTube/Google account.')));
      console.log(pc.gray('  Once signed in and redirected to YouTube, return here and press [Enter] to continue...\n'));

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await new Promise<void>((resolve) => {
        rl.question('  Press Enter to extract credentials: ', () => {
          rl.close();
          resolve();
        });
      });

      logProgress('Processing authenticated session...');
      if (!page.url().includes('youtube.com')) {
        await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
      }
    } else {
      logProgress('Navigating to YouTube to establish session...');
      await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        waitUntil: 'domcontentloaded',
      });
      // Allow session cookies and ytcfg initialization
      await page.waitForTimeout(2000);
    }

    logProgress('Extracting browser cookies and client profile...');
    const allCookies = await context.cookies([
      'https://www.youtube.com',
      'https://youtube.com',
      'https://google.com',
    ]);
    const ytCookies = allCookies.filter(
      (c) => c.domain.includes('youtube.com') || c.domain.includes('.google.com')
    );
    const cookieString = ytCookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const isAuthenticated = ytCookies.some(
      (c) => c.name === 'LOGIN_INFO' || c.name === '__Secure-3PSID' || c.name === 'SAPISID'
    );

    // Extract visitorData from page runtime ytcfg
    let visitorData: string | null = await page.evaluate(() => {
      try {
        const win = globalThis as unknown as Record<string, any>;
        return (
          win['ytcfg']?.get?.('VISITOR_DATA') ||
          win['ytcfg']?.get?.('INNERTUBE_CONTEXT')?.client?.visitorData ||
          null
        );
      } catch {
        return null;
      }
    });

    const userAgent = await page.evaluate(() => {
      const win = globalThis as unknown as Record<string, any>;
      return (
        (win['navigator']?.userAgent as string) ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
      );
    });

    logProgress(`Generating BotGuard Proof of Origin (poToken) matched to ${browserName} fingerprint...`);
    const tokenResult = await generateYouTubePoToken({
      userAgent,
      timeoutMs: options.timeoutMs ?? 10000,
    });

    const poToken = tokenResult.poToken;
    if (!visitorData) {
      visitorData = tokenResult.visitorData;
    }

    return {
      cookies: cookieString,
      cookieCount: ytCookies.length,
      poToken,
      visitorData,
      userAgent,
      isAuthenticated,
      browserUsed: browserName,
    };
  } finally {
    await browser.close();
  }
}

// Backwards compatibility alias
export const harvestYouTubeFirefoxSession = (options: BrowserHarvesterOptions = {}) =>
  harvestYouTubeBrowserSession({ ...options, browser: 'firefox' });
