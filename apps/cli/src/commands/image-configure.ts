import { Command } from 'commander';
import pc from 'picocolors';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { MockImageProvider } from '@ririko/services';
import {
  maskSecret,
  readEnvFile,
  resolveEnvFilePath,
  updateEnvFile,
} from '../utils/env-editor.js';

export interface ImageConfigureOptions {
  provider?: string | undefined;
  geminiKey?: string | undefined;
  comfyuiUrl?: string | undefined;
  replicateToken?: string | undefined;
  dailyQuota?: string | undefined;
  show?: boolean | undefined;
  test?: boolean | undefined;
  interactive?: boolean | undefined;
  yes?: boolean | undefined;
  envFile?: string | undefined;
}

export const SUPPORTED_IMAGE_PROVIDERS = ['gemini', 'comfyui', 'replicate', 'mock', 'auto'] as const;
export type SupportedImageProvider = (typeof SUPPORTED_IMAGE_PROVIDERS)[number];

export const IMAGE_PROVIDER_METADATA: Record<
  SupportedImageProvider,
  {
    name: string;
    description: string;
    envKey?: string;
  }
> = {
  gemini: {
    name: 'Google Gemini Imagen',
    description: 'Official Google Gemini Imagen 3/4 cloud generation via @google/genai (Recommended)',
    envKey: 'GEMINI_API_KEY',
  },
  comfyui: {
    name: 'ComfyUI / SD-WebUI',
    description: 'Self-hosted local GPU generation via ComfyUI or Stable Diffusion WebUI REST API',
    envKey: 'COMFYUI_BASE_URL',
  },
  replicate: {
    name: 'Replicate Cloud',
    description: 'Hosted open-source diffusion and Flux models via Replicate prediction API',
    envKey: 'REPLICATE_API_TOKEN',
  },
  mock: {
    name: 'Offline Mock Synthesizer',
    description: 'Deterministic offline @napi-rs/canvas synthesizer (Zero external API dependencies)',
  },
  auto: {
    name: 'Auto (Best Available)',
    description: 'Automatically attempts Gemini -> ComfyUI -> Replicate -> Mock',
  },
};

/**
 * Displays current Image Generation configuration status and masked secrets in terminal.
 */
export function printImageStatus(env: Record<string, string>, targetPath: string): void {
  const currentProvider = (env.IMAGE_DEFAULT_PROVIDER || 'gemini').toLowerCase();
  const currentQuota = env.IMAGE_DAILY_QUOTA || '30';

  console.log(pc.bold(pc.magenta('\n╭──────────────────────────────────────────────────╮')));
  console.log(pc.bold(pc.magenta('│     🎨 Ririko AI Image Generation Configuration  │')));
  console.log(pc.bold(pc.magenta('╰──────────────────────────────────────────────────╯\n')));

  console.log(`  ${pc.bold('Target File:')}         ${pc.gray(targetPath)}`);
  console.log(`  ${pc.bold('Default Provider:')}    ${pc.cyan(pc.bold(currentProvider.toUpperCase()))}`);
  console.log(`  ${pc.bold('Daily User Quota:')}    ${pc.green(`${currentQuota} images/day`)}\n`);

  console.log(pc.bold('  ── Provider Details ──────────────────────────────'));

  // Gemini Imagen
  const hasGemini = Boolean(env.GEMINI_API_KEY);
  const isGeminiPrimary = currentProvider === 'gemini';
  console.log(
    `  ${isGeminiPrimary ? pc.yellow('★ ') : '  '}${pc.bold('Google Gemini Imagen:')}  ${
      hasGemini ? pc.green('✔ Configured') : pc.red('✖ Missing Key')
    } ${isGeminiPrimary ? pc.yellow('(PRIMARY)') : ''}`,
  );
  console.log(`    ${pc.gray('GEMINI_API_KEY:')}          ${pc.gray(maskSecret(env.GEMINI_API_KEY))}`);

  // ComfyUI
  const comfyUrl = env.COMFYUI_BASE_URL;
  const isComfyPrimary = currentProvider === 'comfyui';
  console.log(
    `  ${isComfyPrimary ? pc.yellow('★ ') : '  '}${pc.bold('ComfyUI / SD-WebUI:')}     ${
      comfyUrl ? pc.green('✔ Configured') : pc.gray('○ Not Configured')
    } ${isComfyPrimary ? pc.yellow('(PRIMARY)') : ''}`,
  );
  console.log(`    ${pc.gray('COMFYUI_BASE_URL:')}        ${pc.gray(comfyUrl || '(none, default: http://127.0.0.1:8188)')}`);

  // Replicate
  const hasReplicate = Boolean(env.REPLICATE_API_TOKEN);
  const isReplicatePrimary = currentProvider === 'replicate';
  console.log(
    `  ${isReplicatePrimary ? pc.yellow('★ ') : '  '}${pc.bold('Replicate Cloud:')}        ${
      hasReplicate ? pc.green('✔ Configured') : pc.gray('○ Not Configured')
    } ${isReplicatePrimary ? pc.yellow('(PRIMARY)') : ''}`,
  );
  console.log(`    ${pc.gray('REPLICATE_API_TOKEN:')}    ${pc.gray(maskSecret(env.REPLICATE_API_TOKEN))}`);

  // Mock
  const isMockPrimary = currentProvider === 'mock';
  console.log(
    `  ${isMockPrimary ? pc.yellow('★ ') : '  '}${pc.bold('Offline Mock Synth:')}     ${pc.green('✔ Active (Always available)')} ${
      isMockPrimary ? pc.yellow('(PRIMARY)') : ''
    }\n`,
  );
}

/**
 * Validates connection availability for configured image generation providers.
 */
export async function testImageProviders(env: Record<string, string>): Promise<void> {
  console.log(pc.bold('\n🔍 Testing Image Generation Providers...\n'));

  // 1. Gemini
  if (env.GEMINI_API_KEY) {
    if (env.GEMINI_API_KEY.startsWith('AIzaSy')) {
      console.log(`  ${pc.green('✔')} ${pc.bold('Google Gemini Imagen:')} API key structure validated`);
    } else {
      console.log(`  ${pc.yellow('!')} ${pc.bold('Google Gemini Imagen:')} Key configured (non-standard prefix)`);
    }
  } else {
    console.log(`  ${pc.gray('○')} ${pc.bold('Google Gemini Imagen:')} Not configured (GEMINI_API_KEY missing)`);
  }

  // 2. ComfyUI
  const comfyUrl = env.COMFYUI_BASE_URL;
  if (comfyUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${comfyUrl.replace(/\/+$/, '')}/system_stats`, {
        signal: controller.signal,
      }).catch(async () => {
        // Fallback check on root
        return fetch(comfyUrl, { signal: controller.signal });
      });
      clearTimeout(timeout);
      if (res && res.status < 500) {
        console.log(`  ${pc.green('✔')} ${pc.bold('ComfyUI / SD-WebUI:')} Server responded (${res.status} OK at ${comfyUrl})`);
      } else {
        console.log(`  ${pc.yellow('!')} ${pc.bold('ComfyUI / SD-WebUI:')} Server returned status ${res?.status} at ${comfyUrl}`);
      }
    } catch {
      console.log(`  ${pc.yellow('!')} ${pc.bold('ComfyUI / SD-WebUI:')} Could not reach ${comfyUrl} (Ensure ComfyUI is running)`);
    }
  } else {
    console.log(`  ${pc.gray('○')} ${pc.bold('ComfyUI / SD-WebUI:')} Not configured (COMFYUI_BASE_URL missing)`);
  }

  // 3. Replicate
  if (env.REPLICATE_API_TOKEN) {
    console.log(`  ${pc.green('✔')} ${pc.bold('Replicate Cloud:')} Token configured (${maskSecret(env.REPLICATE_API_TOKEN)})`);
  } else {
    console.log(`  ${pc.gray('○')} ${pc.bold('Replicate Cloud:')} Not configured (REPLICATE_API_TOKEN missing)`);
  }

  // 4. Mock Provider
  try {
    const mock = new MockImageProvider();
    const mockRes = await mock.generate({
      prompt: 'CLI Diagnostic Test',
      userId: 'cli',
    });
    if (mockRes.images.length > 0 && mockRes.images[0]?.buffer.length) {
      console.log(`  ${pc.green('✔')} ${pc.bold('Offline Mock Synthesizer:')} Synthesis verified (Generated ${mockRes.images[0].buffer.length} bytes in ${mockRes.durationMs}ms)`);
    }
  } catch (err: unknown) {
    console.log(`  ${pc.red('✖')} ${pc.bold('Offline Mock Synthesizer:')} Failed (${err instanceof Error ? err.message : String(err)})`);
  }

  console.log('');
}

/**
 * Runs an interactive step-by-step CLI configuration wizard.
 */
export async function runInteractiveWizard(envPath: string): Promise<void> {
  const currentEnv = readEnvFile(envPath);
  printImageStatus(currentEnv, envPath);

  const rl = createInterface({ input, output });

  try {
    console.log(pc.bold(pc.cyan('Interactive Image Generation Setup Wizard\n')));

    // 1. Default Provider Selection
    console.log(pc.bold('Step 1: Choose Default Image Provider'));
    console.log('  1) Google Gemini Imagen (Recommended cloud generation)');
    console.log('  2) ComfyUI / SD-WebUI (Self-hosted local GPU)');
    console.log('  3) Replicate Cloud (Cloud Flux / SD models)');
    console.log('  4) Offline Mock (Zero external API dependencies)');
    console.log('  5) Auto (Best Available)');

    const currentProvider = (currentEnv.IMAGE_DEFAULT_PROVIDER || 'gemini').toLowerCase();
    let defaultChoice = '1';
    if (currentProvider === 'comfyui') defaultChoice = '2';
    else if (currentProvider === 'replicate') defaultChoice = '3';
    else if (currentProvider === 'mock') defaultChoice = '4';
    else if (currentProvider === 'auto') defaultChoice = '5';

    const providerAns = (
      await rl.question(`\nSelect provider [1-5] (default: ${defaultChoice}): `)
    ).trim() || defaultChoice;

    let selectedProvider: SupportedImageProvider = 'gemini';
    if (providerAns === '2' || providerAns.toLowerCase() === 'comfyui') {
      selectedProvider = 'comfyui';
    } else if (providerAns === '3' || providerAns.toLowerCase() === 'replicate') {
      selectedProvider = 'replicate';
    } else if (providerAns === '4' || providerAns.toLowerCase() === 'mock') {
      selectedProvider = 'mock';
    } else if (providerAns === '5' || providerAns.toLowerCase() === 'auto') {
      selectedProvider = 'auto';
    }

    const updates: Record<string, string | undefined> = {
      IMAGE_DEFAULT_PROVIDER: selectedProvider,
    };

    console.log(pc.green(`\n✔ Default provider set to: ${IMAGE_PROVIDER_METADATA[selectedProvider].name}\n`));

    // 2. Configure credentials
    if (selectedProvider === 'gemini' || selectedProvider === 'auto') {
      const existingKey = currentEnv.GEMINI_API_KEY;
      const promptText = existingKey
        ? `Enter Google Gemini API Key [Press enter to keep: ${maskSecret(existingKey)}]: `
        : 'Enter Google Gemini API Key (or press enter to skip): ';
      const inputKey = (await rl.question(promptText)).trim();
      if (inputKey) {
        updates.GEMINI_API_KEY = inputKey;
      }
    }

    if (selectedProvider === 'comfyui' || selectedProvider === 'auto') {
      const existingUrl = currentEnv.COMFYUI_BASE_URL || 'http://127.0.0.1:8188';
      const promptText = `Enter ComfyUI Base URL [Press enter for: ${existingUrl}]: `;
      const inputUrl = (await rl.question(promptText)).trim();
      if (inputUrl) {
        updates.COMFYUI_BASE_URL = inputUrl;
      } else if (!currentEnv.COMFYUI_BASE_URL) {
        updates.COMFYUI_BASE_URL = existingUrl;
      }
    }

    if (selectedProvider === 'replicate' || selectedProvider === 'auto') {
      const existingToken = currentEnv.REPLICATE_API_TOKEN;
      const promptText = existingToken
        ? `Enter Replicate API Token [Press enter to keep: ${maskSecret(existingToken)}]: `
        : 'Enter Replicate API Token (or press enter to skip): ';
      const inputToken = (await rl.question(promptText)).trim();
      if (inputToken) {
        updates.REPLICATE_API_TOKEN = inputToken;
      }
    }

    // 3. Daily quota
    const currentQuota = currentEnv.IMAGE_DAILY_QUOTA || '30';
    console.log(pc.bold('\nStep 2: User Daily Quota'));
    const inputQuota = (
      await rl.question(`Enter daily image quota per user [Press enter for: ${currentQuota}]: `)
    ).trim();
    if (inputQuota) {
      updates.IMAGE_DAILY_QUOTA = inputQuota;
    }

    // 4. Save updates
    const result = updateEnvFile(envPath, updates);
    console.log(pc.green(`\n✔ Successfully saved image configuration to ${result.filePath}:`));
    for (const k of [...result.updatedKeys, ...result.addedKeys]) {
      const val = updates[k];
      const isSecret = k.toLowerCase().includes('key') || k.toLowerCase().includes('token');
      console.log(`  • ${pc.bold(k)} = ${pc.cyan(isSecret ? maskSecret(val) : val ?? '')}`);
    }

    // 5. Test prompt
    const testAns = (
      await rl.question('\nWould you like to test the configured provider connections now? [Y/n]: ')
    ).trim().toLowerCase();
    if (testAns !== 'n' && testAns !== 'no') {
      const updatedEnv = readEnvFile(envPath);
      await testImageProviders(updatedEnv);
    }
  } finally {
    rl.close();
  }
}

/**
 * Registers the `image-configure` (and alias `image:configure`) CLI command.
 */
export function registerImageConfigureCommand(program: Command): void {
  program
    .command('image-configure')
    .alias('image:configure')
    .description('Configure AI Image Generation providers (Gemini, ComfyUI, Replicate), API keys, and daily quotas')
    .option('-p, --provider <provider>', 'Default image provider (gemini, comfyui, replicate, mock, auto)')
    .option('--gemini-key <key>', 'Google Gemini API key (GEMINI_API_KEY)')
    .option('--comfyui-url <url>', 'ComfyUI / SD-WebUI REST API base URL (COMFYUI_BASE_URL)')
    .option('--replicate-token <token>', 'Replicate API token (REPLICATE_API_TOKEN)')
    .option('--daily-quota <quota>', 'Daily image generation quota per user (IMAGE_DAILY_QUOTA)')
    .option('--show', 'Display current image generation configuration status and exit')
    .option('-t, --test', 'Test image provider connections and exit')
    .option('-i, --interactive', 'Run interactive setup wizard')
    .option('-y, --yes', 'Apply changes without confirmation prompts')
    .option('--env-file <path>', 'Custom path to environment file (.env)')
    .action(async (options: ImageConfigureOptions) => {
      const envPath = resolveEnvFilePath(options.envFile);
      const currentEnv = readEnvFile(envPath);

      // 1. Show status only
      if (options.show) {
        printImageStatus(currentEnv, envPath);
        return;
      }

      // 2. Test providers only
      if (options.test && !options.provider && !options.geminiKey && !options.comfyuiUrl && !options.replicateToken) {
        await testImageProviders(currentEnv);
        return;
      }

      // 3. Determine if interactive wizard should execute
      const hasFlags = Boolean(
        options.provider ||
        options.geminiKey ||
        options.comfyuiUrl ||
        options.replicateToken ||
        options.dailyQuota ||
        options.yes
      );

      if (options.interactive || (!hasFlags && process.stdin.isTTY)) {
        await runInteractiveWizard(envPath);
        return;
      }

      // 4. Non-interactive flag-based updates
      const updates: Record<string, string | undefined> = {};

      if (options.provider) {
        const p = options.provider.toLowerCase();
        if (!SUPPORTED_IMAGE_PROVIDERS.includes(p as SupportedImageProvider)) {
          console.error(
            pc.red(
              `\n✖ Invalid provider: '${options.provider}'. Must be one of: ${SUPPORTED_IMAGE_PROVIDERS.join(', ')}`,
            ),
          );
          process.exit(1);
        }
        updates.IMAGE_DEFAULT_PROVIDER = p;
      }

      if (options.geminiKey !== undefined) {
        updates.GEMINI_API_KEY = options.geminiKey;
      }

      if (options.comfyuiUrl !== undefined) {
        updates.COMFYUI_BASE_URL = options.comfyuiUrl;
      }

      if (options.replicateToken !== undefined) {
        updates.REPLICATE_API_TOKEN = options.replicateToken;
      }

      if (options.dailyQuota !== undefined) {
        updates.IMAGE_DAILY_QUOTA = options.dailyQuota;
      }

      if (Object.keys(updates).length > 0) {
        const result = updateEnvFile(envPath, updates);
        console.log(pc.green(`\n✔ Successfully updated image configuration in ${result.filePath}:`));
        for (const k of [...result.updatedKeys, ...result.addedKeys]) {
          const val = updates[k];
          const isSecret = k.toLowerCase().includes('key') || k.toLowerCase().includes('token');
          console.log(`  • ${pc.bold(k)} = ${pc.cyan(isSecret ? maskSecret(val) : val ?? '')}`);
        }

        if (options.test) {
          const updatedEnv = readEnvFile(envPath);
          await testImageProviders(updatedEnv);
        }
      } else {
        printImageStatus(currentEnv, envPath);
        console.log(pc.gray('Tip: Run `ririko image-configure -i` for the interactive wizard or see `ririko image-configure --help`.\n'));
      }
    });
}
