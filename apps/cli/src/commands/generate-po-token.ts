import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateYouTubePoToken } from '@ririko/music';
import { Command } from 'commander';
import pc from 'picocolors';
import {
  harvestYouTubeBrowserSession,
  type SupportedBrowser,
} from '../youtube/browser-harvester.js';

export interface GeneratePoTokenOptions {
  save?: boolean | undefined;
  timeout?: string | undefined;
  env?: string | undefined;
  chrome?: boolean | undefined;
  firefox?: boolean | undefined;
  browser?: string | undefined;
  login?: boolean | undefined;
}

function resolveEnvFilePath(customPath?: string): string {
  if (customPath) {
    return resolve(process.cwd(), customPath);
  }
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0]!;
}

function updateEnvFile(
  envPath: string,
  data: { poToken: string; visitorData: string; cookie?: string }
): void {
  let content = '';
  if (existsSync(envPath)) {
    content = readFileSync(envPath, 'utf-8');
  }

  // Replace or append YOUTUBE_COOKIE
  if (data.cookie !== undefined) {
    if (/^YOUTUBE_COOKIE=.*/m.test(content)) {
      content = content.replace(/^YOUTUBE_COOKIE=.*/m, `YOUTUBE_COOKIE="${data.cookie}"`);
    } else {
      content += (content.endsWith('\n') || content.length === 0 ? '' : '\n') + `YOUTUBE_COOKIE="${data.cookie}"\n`;
    }
  }

  // Replace or append YOUTUBE_PO_TOKEN
  if (/^YOUTUBE_PO_TOKEN=.*/m.test(content)) {
    content = content.replace(/^YOUTUBE_PO_TOKEN=.*/m, `YOUTUBE_PO_TOKEN="${data.poToken}"`);
  } else {
    content += (content.endsWith('\n') || content.length === 0 ? '' : '\n') + `YOUTUBE_PO_TOKEN="${data.poToken}"\n`;
  }

  // Replace or append YOUTUBE_VISITOR_DATA
  if (/^YOUTUBE_VISITOR_DATA=.*/m.test(content)) {
    content = content.replace(/^YOUTUBE_VISITOR_DATA=.*/m, `YOUTUBE_VISITOR_DATA="${data.visitorData}"`);
  } else {
    content += (content.endsWith('\n') || content.length === 0 ? '' : '\n') + `YOUTUBE_VISITOR_DATA="${data.visitorData}"\n`;
  }

  writeFileSync(envPath, content, 'utf-8');
}

export function registerGeneratePoTokenCommand(program: Command): void {
  program
    .command('generate:po-token')
    .alias('youtube:token')
    .description('Generate YouTube credentials (PO token, visitor data, and cookies via Chrome or JSDOM)')
    .option('-s, --save', 'Save generated credentials directly to active .env file')
    .option('-c, --chrome', 'Use Google Chrome / Chromium to harvest session cookies alongside tokens (recommended)')
    .option('-f, --firefox', 'Use Firefox to harvest session cookies alongside tokens')
    .option('-b, --browser <engine>', 'Browser engine: chrome, chromium, or firefox')
    .option('-l, --login', 'Open interactive browser window to log into YouTube account (implies Chrome)')
    .option('-t, --timeout <ms>', 'Execution timeout in milliseconds', '15000')
    .option('-e, --env <path>', 'Custom path to .env file')
    .action(async (options: GeneratePoTokenOptions) => {
      const useBrowser = Boolean(options.chrome || options.firefox || options.login || options.browser);
      const timeoutMs = options.timeout ? Number.parseInt(options.timeout, 10) : 15000;
      const startTime = Date.now();

      if (useBrowser) {
        let browserType: SupportedBrowser = 'chrome';
        if (options.firefox) {
          browserType = 'firefox';
        } else if (options.browser === 'chromium') {
          browserType = 'chromium';
        } else if (options.browser === 'firefox') {
          browserType = 'firefox';
        }

        console.log(pc.bold(pc.magenta(`\n🌸 Ririko AI 2.0.0 — YouTube Browser Credential Harvester\n`)));
        try {
          const result = await harvestYouTubeBrowserSession({
            browser: browserType,
            login: options.login,
            timeoutMs,
          });
          const elapsed = Date.now() - startTime;

          console.log(pc.green(`\n✔ Successfully harvested YouTube credentials in ${elapsed}ms!\n`));
          console.log(`  ${pc.cyan('Engine:')}        ${pc.bold(result.browserUsed)}`);
          console.log(`  ${pc.cyan('Mode:')}          ${result.isAuthenticated ? pc.green('Authenticated Account Session') : pc.yellow('Guest Browser Session')}`);
          console.log(`  ${pc.cyan('Cookies:')}       ${result.cookieCount} cookies extracted`);
          console.log(`  ${pc.cyan('User-Agent:')}    ${pc.gray(result.userAgent)}\n`);

          console.log(pc.bold(pc.yellow('Visitor Data:')));
          console.log(`  ${pc.gray(result.visitorData)}\n`);

          console.log(pc.bold(pc.yellow('Proof of Origin (PO Token):')));
          console.log(`  ${pc.gray(result.poToken)}\n`);

          console.log(pc.bold(pc.yellow('YouTube Cookie Header (Preview):')));
          console.log(`  ${pc.gray(result.cookies.slice(0, 100))}...\n`);

          if (options.save) {
            const envPath = resolveEnvFilePath(options.env);
            updateEnvFile(envPath, {
              cookie: result.cookies,
              poToken: result.poToken,
              visitorData: result.visitorData,
            });
            console.log(pc.green('💾 Saved YOUTUBE_COOKIE, YOUTUBE_PO_TOKEN, and YOUTUBE_VISITOR_DATA to:'));
            console.log(`  ${pc.cyan(envPath)}\n`);
          } else {
            console.log(pc.gray('Tip: Run with --save to persist all 3 variables into your .env file:'));
            console.log(pc.cyan('  pnpm ririko generate:po-token --chrome --save\n'));
          }
        } catch (err) {
          console.error(pc.red(`\n✖ Browser harvesting failed: ${(err as Error).message}\n`));
          process.exitCode = 1;
        }
      } else {
        console.log(pc.bold(pc.magenta('\n🌸 Ririko AI 2.0.0 — YouTube PO-Token Generator (Fast JSDOM)\n')));
        console.log(pc.cyan('⚡ Initializing YouTube BotGuard challenge runner in secure JSDOM runtime...'));

        try {
          const result = await generateYouTubePoToken({ timeoutMs });
          const elapsed = Date.now() - startTime;

          console.log(pc.green(`✔ Successfully generated YouTube credentials in ${elapsed}ms!\n`));

          console.log(pc.bold(pc.yellow('Visitor Data:')));
          console.log(`  ${pc.gray(result.visitorData)}\n`);

          console.log(pc.bold(pc.yellow('Proof of Origin (PO Token):')));
          console.log(`  ${pc.gray(result.poToken)}\n`);

          if (options.save) {
            const envPath = resolveEnvFilePath(options.env);
            updateEnvFile(envPath, {
              poToken: result.poToken,
              visitorData: result.visitorData,
            });
            console.log(pc.green('💾 Saved YOUTUBE_PO_TOKEN and YOUTUBE_VISITOR_DATA to:'));
            console.log(`  ${pc.cyan(envPath)}\n`);
          } else {
            console.log(pc.gray('Tip: Run with --save to automatically persist these into your .env file:'));
            console.log(pc.cyan('  pnpm ririko generate:po-token --save\n'));
            console.log(pc.gray('Or harvest full YouTube cookies with Chrome:'));
            console.log(pc.cyan('  pnpm ririko generate:po-token --chrome --save\n'));
          }
        } catch (err) {
          console.error(pc.red(`\n✖ Failed to generate YouTube PO token: ${(err as Error).message}\n`));
          process.exitCode = 1;
        }
      }
    });
}
