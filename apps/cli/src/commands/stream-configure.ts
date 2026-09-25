import { Command } from 'commander';
import pc from 'picocolors';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { TwitchStreamAdapter, YouTubeStreamAdapter, TikTokStreamAdapter } from '@ririko/services';
import { maskSecret, readEnvFile, resolveEnvFilePath, updateEnvFile } from '../utils/env-editor.js';

export interface StreamConfigureOptions {
  twitchClientId?: string | undefined;
  twitchClientSecret?: string | undefined;
  youtubeKey?: string | undefined;
  tiktokSessionId?: string | undefined;
  tiktokKey?: string | undefined;
  checkInterval?: string | undefined;
  show?: boolean | undefined;
  test?: boolean | undefined;
  interactive?: boolean | undefined;
  yes?: boolean | undefined;
  envFile?: string | undefined;
}

/**
 * Displays current Stream configuration status and masked secrets in terminal.
 */
export function printStreamStatus(env: Record<string, string>, targetPath: string): void {
  const checkInterval = env.STREAM_CHECK_INTERVAL_MS || '60000';
  const checkSeconds = Math.round(Number(checkInterval) / 1000);

  console.log(pc.bold(pc.magenta('\n╭──────────────────────────────────────────────────╮')));
  console.log(pc.bold(pc.magenta('│     📡 Ririko Stream Watcher Configuration       │')));
  console.log(pc.bold(pc.magenta('╰──────────────────────────────────────────────────╯\n')));

  console.log(`  ${pc.bold('Target File:')}         ${pc.gray(targetPath)}`);
  console.log(
    `  ${pc.bold('Polling Interval:')}    ${pc.cyan(`${checkInterval}ms (${checkSeconds}s)`)}\n`,
  );

  console.log(pc.bold('  ── Provider Credentials ───────────────────────────'));

  // 1. Twitch Helix
  const hasTwitchId = Boolean(env.TWITCH_CLIENT_ID);
  const hasTwitchSecret = Boolean(env.TWITCH_CLIENT_SECRET);
  const isTwitchReady = hasTwitchId && hasTwitchSecret;

  console.log(
    `  ${pc.bold('🟣 Twitch Helix:')}        ${
      isTwitchReady
        ? pc.green('✔ Configured (Helix API Active)')
        : pc.yellow('○ Missing Credentials (Live status checks skipped)')
    }`,
  );
  console.log(`    ${pc.gray('Client ID:')}         ${pc.gray(maskSecret(env.TWITCH_CLIENT_ID))}`);
  console.log(
    `    ${pc.gray('Client Secret:')}     ${pc.gray(maskSecret(env.TWITCH_CLIENT_SECRET))}`,
  );

  // 2. YouTube Live
  const hasYoutubeKey = Boolean(env.YOUTUBE_API_KEY);
  console.log(
    `  ${pc.bold('🔴 YouTube Live:')}        ${
      hasYoutubeKey
        ? pc.green('✔ Configured (Data API v3 Active)')
        : pc.blue('ℹ Public Web & RSS Fallback Active (Zero Credentials)')
    }`,
  );
  console.log(`    ${pc.gray('API Key:')}           ${pc.gray(maskSecret(env.YOUTUBE_API_KEY))}`);

  // 3. TikTok Live
  const hasTiktokSession = Boolean(env.TIKTOK_SESSION_ID);
  const hasTiktokKey = Boolean(env.TIKTOK_API_KEY);
  const isTiktokCustom = hasTiktokSession || hasTiktokKey;
  console.log(
    `  ${pc.bold('⚫ TikTok Live:')}         ${
      isTiktokCustom
        ? pc.green('✔ Session / API Configured')
        : pc.blue('ℹ Public Webcast Alive Checks Active')
    }`,
  );
  if (env.TIKTOK_SESSION_ID) {
    console.log(
      `    ${pc.gray('Session ID:')}        ${pc.gray(maskSecret(env.TIKTOK_SESSION_ID))}`,
    );
  }
  if (env.TIKTOK_API_KEY) {
    console.log(`    ${pc.gray('API Key:')}           ${pc.gray(maskSecret(env.TIKTOK_API_KEY))}`);
  }
  console.log('');
}

/**
 * Validates streaming platform API connectivity with configured credentials.
 */
export async function testStreamProviders(env: Record<string, string>): Promise<void> {
  console.log(pc.bold(pc.cyan('\n🔍 Testing Live Stream Adapters Connectivity...\n')));

  // 1. Test Twitch
  if (env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET) {
    process.stdout.write('  • Testing Twitch Helix API... ');
    try {
      const adapter = new TwitchStreamAdapter({
        clientId: env.TWITCH_CLIENT_ID,
        clientSecret: env.TWITCH_CLIENT_SECRET,
      });
      const resolved = await adapter.resolveStreamer('twitch');
      if (resolved) {
        console.log(pc.green(`✔ Connected! (Resolved: ${resolved.displayName})`));
      } else {
        console.log(pc.yellow('⚠ Credentials accepted, but failed to resolve default user.'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(pc.red(`✖ Failed: ${msg}`));
    }
  } else {
    console.log(pc.gray('  • Twitch: Skipping API test (TWITCH_CLIENT_ID / SECRET not set)'));
  }

  // 2. Test YouTube
  process.stdout.write('  • Testing YouTube Live Adapter... ');
  try {
    const adapter = new YouTubeStreamAdapter({
      apiKey: env.YOUTUBE_API_KEY,
    });
    const resolved = await adapter.resolveStreamer('YouTube');
    if (resolved) {
      const mode = env.YOUTUBE_API_KEY ? 'Data API v3' : 'Public Web Fallback';
      console.log(pc.green(`✔ Connected via ${mode}! (Resolved: ${resolved.displayName})`));
    } else {
      console.log(pc.yellow('⚠ Handshake succeeded, metadata could not be fetched.'));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(pc.red(`✖ Failed: ${msg}`));
  }

  // 3. Test TikTok
  process.stdout.write('  • Testing TikTok Live Adapter... ');
  try {
    const adapter = new TikTokStreamAdapter({
      sessionId: env.TIKTOK_SESSION_ID,
      apiKey: env.TIKTOK_API_KEY,
    });
    const resolved = await adapter.resolveStreamer('tiktok');
    if (resolved) {
      console.log(pc.green(`✔ Connected! (Resolved: ${resolved.displayName})`));
    } else {
      console.log(pc.yellow('⚠ Public alive check active.'));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(pc.red(`✖ Failed: ${msg}`));
  }

  console.log('');
}

/**
 * Interactive setup prompt for stream credentials and polling schedule.
 */
async function runInteractiveSetup(
  currentEnv: Record<string, string>,
  envPath: string,
): Promise<void> {
  const rl = createInterface({ input, output });

  try {
    console.log(pc.bold(pc.cyan('\n⚙ Interactive Stream Watcher Configuration Wizard\n')));
    console.log(pc.gray('Press [Enter] to keep current / existing values.\n'));

    const updates: Record<string, string | undefined> = {};

    // 1. Twitch Client ID
    const currentTwitchId = currentEnv.TWITCH_CLIENT_ID ?? '';
    const twitchIdPrompt = currentTwitchId
      ? `Twitch Client ID [${maskSecret(currentTwitchId)}]: `
      : 'Twitch Client ID (Optional, from dev.twitch.tv): ';
    const twitchIdAnswer = (await rl.question(twitchIdPrompt)).trim();
    if (twitchIdAnswer) updates.TWITCH_CLIENT_ID = twitchIdAnswer;

    // 2. Twitch Client Secret
    const currentTwitchSecret = currentEnv.TWITCH_CLIENT_SECRET ?? '';
    const twitchSecretPrompt = currentTwitchSecret
      ? `Twitch Client Secret [${maskSecret(currentTwitchSecret)}]: `
      : 'Twitch Client Secret (Optional): ';
    const twitchSecretAnswer = (await rl.question(twitchSecretPrompt)).trim();
    if (twitchSecretAnswer) updates.TWITCH_CLIENT_SECRET = twitchSecretAnswer;

    // 3. YouTube API Key
    const currentYtKey = currentEnv.YOUTUBE_API_KEY ?? '';
    const ytPrompt = currentYtKey
      ? `YouTube Data API v3 Key [${maskSecret(currentYtKey)}]: `
      : 'YouTube Data API v3 Key (Optional, from Google Cloud Console): ';
    const ytAnswer = (await rl.question(ytPrompt)).trim();
    if (ytAnswer) updates.YOUTUBE_API_KEY = ytAnswer;

    // 4. TikTok Session ID
    const currentTiktokSession = currentEnv.TIKTOK_SESSION_ID ?? '';
    const tiktokPrompt = currentTiktokSession
      ? `TikTok Session ID Cookie [${maskSecret(currentTiktokSession)}]: `
      : 'TikTok Session ID (Optional, cookie sessionid): ';
    const tiktokAnswer = (await rl.question(tiktokPrompt)).trim();
    if (tiktokAnswer) updates.TIKTOK_SESSION_ID = tiktokAnswer;

    // 5. Polling Interval
    const currentInterval = currentEnv.STREAM_CHECK_INTERVAL_MS || '60000';
    const intervalPrompt = `Stream check polling interval in ms [${currentInterval}]: `;
    const intervalAnswer = (await rl.question(intervalPrompt)).trim();
    if (intervalAnswer) {
      const parsed = parseInt(intervalAnswer, 10);
      if (!isNaN(parsed) && parsed >= 5000) {
        updates.STREAM_CHECK_INTERVAL_MS = String(parsed);
      }
    }

    if (Object.keys(updates).length === 0) {
      console.log(pc.yellow('\nNo changes entered. Configuration remains untouched.'));
      return;
    }

    const result = updateEnvFile(envPath, updates);
    console.log(pc.green(`\n✔ Successfully saved stream configuration in ${result.filePath}!`));

    const testPrompt = await rl.question('\nRun adapter connection tests now? (Y/n): ');
    if (!testPrompt.trim() || testPrompt.trim().toLowerCase() === 'y') {
      const updatedEnv = readEnvFile(envPath);
      await testStreamProviders(updatedEnv);
    }
  } finally {
    rl.close();
  }
}

/**
 * Registers `stream-configure` command in Commander CLI.
 */
export function registerStreamConfigureCommand(program: Command): void {
  program
    .command('stream-configure')
    .alias('stream:configure')
    .alias('streams:configure')
    .alias('streams-configure')
    .description(
      'Configure Twitch, YouTube, and TikTok streaming API credentials and polling interval',
    )
    .option('--twitch-client-id <id>', 'Twitch application Client ID')
    .option('--twitch-client-secret <secret>', 'Twitch application Client Secret')
    .option('--youtube-key <key>', 'Google Cloud YouTube Data API v3 Key')
    .option('--tiktok-session-id <session>', 'TikTok session ID cookie')
    .option('--tiktok-key <key>', 'TikTok API Key')
    .option('--check-interval <ms>', 'Stream check cycle interval in ms (default: 60000)')
    .option('-s, --show', 'Display current streaming configuration and status')
    .option('-t, --test', 'Test API credentials against streaming platforms')
    .option('-i, --interactive', 'Run interactive setup wizard')
    .option('-e, --env-file <path>', 'Custom .env file path')
    .action(async (options: StreamConfigureOptions) => {
      const envPath = resolveEnvFilePath(options.envFile);
      const currentEnv = readEnvFile(envPath);

      // 1. Show mode
      if (options.show) {
        printStreamStatus(currentEnv, envPath);
        return;
      }

      // 2. Test mode
      if (options.test && !options.interactive && !options.twitchClientId && !options.youtubeKey) {
        printStreamStatus(currentEnv, envPath);
        await testStreamProviders(currentEnv);
        return;
      }

      // 3. Interactive mode
      if (options.interactive) {
        await runInteractiveSetup(currentEnv, envPath);
        return;
      }

      // 4. Flag-based update
      const updates: Record<string, string | undefined> = {};

      if (options.twitchClientId !== undefined) {
        updates.TWITCH_CLIENT_ID = options.twitchClientId;
      }
      if (options.twitchClientSecret !== undefined) {
        updates.TWITCH_CLIENT_SECRET = options.twitchClientSecret;
      }
      if (options.youtubeKey !== undefined) {
        updates.YOUTUBE_API_KEY = options.youtubeKey;
      }
      if (options.tiktokSessionId !== undefined) {
        updates.TIKTOK_SESSION_ID = options.tiktokSessionId;
      }
      if (options.tiktokKey !== undefined) {
        updates.TIKTOK_API_KEY = options.tiktokKey;
      }
      if (options.checkInterval !== undefined) {
        const parsed = parseInt(options.checkInterval, 10);
        if (isNaN(parsed) || parsed < 5000) {
          console.error(
            pc.red('\n✖ Check interval must be a valid number of milliseconds (>= 5000).'),
          );
          process.exit(1);
        }
        updates.STREAM_CHECK_INTERVAL_MS = String(parsed);
      }

      if (Object.keys(updates).length > 0) {
        const result = updateEnvFile(envPath, updates);
        console.log(
          pc.green(`\n✔ Successfully updated Stream configuration in ${result.filePath}:`),
        );
        for (const k of [...result.updatedKeys, ...result.addedKeys]) {
          const val = updates[k];
          const isSecret =
            k.toLowerCase().includes('key') ||
            k.toLowerCase().includes('secret') ||
            k.toLowerCase().includes('session');
          console.log(`  • ${pc.bold(k)} = ${pc.cyan(isSecret ? maskSecret(val) : (val ?? ''))}`);
        }

        if (options.test) {
          const updatedEnv = readEnvFile(envPath);
          await testStreamProviders(updatedEnv);
        }
      } else {
        printStreamStatus(currentEnv, envPath);
        console.log(
          pc.gray(
            'Tip: Run `ririko stream-configure -i` for the interactive setup wizard or see `ririko stream-configure --help`.\n',
          ),
        );
      }
    });
}
