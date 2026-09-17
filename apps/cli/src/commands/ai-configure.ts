import { Command } from 'commander';
import pc from 'picocolors';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { GeminiProvider, OpenAIProvider, OllamaProvider } from '@ririko/ai';
import {
  maskSecret,
  readEnvFile,
  resolveEnvFilePath,
  updateEnvFile,
} from '../utils/env-editor.js';

export interface AiConfigureOptions {
  provider?: string | undefined;
  model?: string | undefined;
  geminiKey?: string | undefined;
  openaiKey?: string | undefined;
  openaiBaseUrl?: string | undefined;
  ollamaUrl?: string | undefined;
  show?: boolean | undefined;
  test?: boolean | undefined;
  interactive?: boolean | undefined;
  yes?: boolean | undefined;
  envFile?: string | undefined;
}

export const SUPPORTED_PROVIDERS = ['gemini', 'openai', 'ollama'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export const PROVIDER_METADATA: Record<
  SupportedProvider,
  {
    name: string;
    recommendedModel: string;
    supportedModels: readonly string[];
    description: string;
  }
> = {
  gemini: {
    name: 'Google Gemini',
    recommendedModel: 'gemini-2.5-flash',
    supportedModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.5-flash-lite', 'gemini-3.7-flash'],
    description: 'Fast, multimodal, cost-efficient, 1M+ token context (Recommended flagship)',
  },
  openai: {
    name: 'OpenAI',
    recommendedModel: 'gpt-4o-mini',
    supportedModels: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
    description: 'Industry standard, wide compatibility, powerful reasoning',
  },
  ollama: {
    name: 'Ollama / Local',
    recommendedModel: 'llama3.3',
    supportedModels: ['llama3.3', 'llama3.2', 'mistral', 'qwen2.5', 'deepseek-r1'],
    description: 'Self-hosted, offline, private, zero-cost API requests',
  },
};

/**
 * Displays current AI configuration status and masked keys in terminal.
 */
export function printAiStatus(env: Record<string, string>, targetPath: string): void {
  const currentProvider = (env.DEFAULT_AI_PROVIDER || env.AI_PROVIDER || 'gemini').toLowerCase();
  const currentModel = env.DEFAULT_AI_MODEL || '(default for provider)';

  console.log(pc.bold(pc.magenta('\n╭──────────────────────────────────────────────────╮')));
  console.log(pc.bold(pc.magenta('│        🌸 Ririko AI Configuration Status         │')));
  console.log(pc.bold(pc.magenta('╰──────────────────────────────────────────────────╯\n')));

  console.log(`  ${pc.bold('Target File:')}         ${pc.gray(targetPath)}`);
  console.log(`  ${pc.bold('Default Provider:')}    ${pc.cyan(pc.bold(currentProvider.toUpperCase()))}`);
  console.log(`  ${pc.bold('Default Model:')}       ${pc.green(currentModel)}\n`);

  console.log(pc.bold('  ── Provider Details ──────────────────────────────'));

  // Gemini
  const hasGemini = Boolean(env.GEMINI_API_KEY);
  const isGeminiPrimary = currentProvider === 'gemini';
  console.log(
    `  ${isGeminiPrimary ? pc.yellow('★ ') : '  '}${pc.bold('Google Gemini:')}    ${
      hasGemini ? pc.green('✔ Configured') : pc.red('✖ Missing Key')
    } ${isGeminiPrimary ? pc.yellow('(PRIMARY)') : ''}`,
  );
  console.log(`    ${pc.gray('API Key:')}           ${pc.gray(maskSecret(env.GEMINI_API_KEY))}`);
  console.log(`    ${pc.gray('Default Model:')}     ${pc.gray(PROVIDER_METADATA.gemini.recommendedModel)}`);

  // OpenAI
  const hasOpenai = Boolean(env.OPENAI_API_KEY);
  const isOpenaiPrimary = currentProvider === 'openai';
  console.log(
    `  ${isOpenaiPrimary ? pc.yellow('★ ') : '  '}${pc.bold('OpenAI:')}           ${
      hasOpenai ? pc.green('✔ Configured') : pc.gray('○ Not Configured')
    } ${isOpenaiPrimary ? pc.yellow('(PRIMARY)') : ''}`,
  );
  console.log(`    ${pc.gray('API Key:')}           ${pc.gray(maskSecret(env.OPENAI_API_KEY))}`);
  if (env.OPENAI_BASE_URL) {
    console.log(`    ${pc.gray('Base URL:')}          ${pc.gray(env.OPENAI_BASE_URL)}`);
  }
  console.log(`    ${pc.gray('Default Model:')}     ${pc.gray(PROVIDER_METADATA.openai.recommendedModel)}`);

  // Ollama
  const ollamaUrl = env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const isOllamaPrimary = currentProvider === 'ollama';
  console.log(
    `  ${isOllamaPrimary ? pc.yellow('★ ') : '  '}${pc.bold('Ollama / Local:')}    ${pc.cyan(
      '✔ Ready',
    )} ${isOllamaPrimary ? pc.yellow('(PRIMARY)') : ''}`,
  );
  console.log(`    ${pc.gray('Base URL:')}          ${pc.gray(ollamaUrl)}`);
  console.log(`    ${pc.gray('Default Model:')}     ${pc.gray(PROVIDER_METADATA.ollama.recommendedModel)}\n`);
}

/**
 * Tests live connection health of configured AI providers.
 */
export async function testAiProviders(env: Record<string, string>): Promise<void> {
  console.log(pc.cyan('\n🔍 Testing AI Provider Connections...\n'));

  // Test Gemini if key exists
  if (env.GEMINI_API_KEY) {
    process.stdout.write(`  • Google Gemini: `);
    try {
      const provider = new GeminiProvider({ apiKey: env.GEMINI_API_KEY });
      const health = await provider.checkHealth();
      if (health.healthy) {
        console.log(pc.green(`✔ Connected (${health.latencyMs}ms)`));
      } else {
        console.log(pc.red(`✖ Failed: ${health.error}`));
      }
    } catch (err: unknown) {
      console.log(pc.red(`✖ Error: ${err instanceof Error ? err.message : String(err)}`));
    }
  } else {
    console.log(`  • Google Gemini: ${pc.gray('(skipped - no GEMINI_API_KEY)')}`);
  }

  // Test OpenAI if key exists
  if (env.OPENAI_API_KEY) {
    process.stdout.write(`  • OpenAI: `);
    try {
      const provider = new OpenAIProvider({
        apiKey: env.OPENAI_API_KEY,
        baseURL: env.OPENAI_BASE_URL,
      });
      const health = await provider.checkHealth();
      if (health.healthy) {
        console.log(pc.green(`✔ Connected (${health.latencyMs}ms)`));
      } else {
        console.log(pc.red(`✖ Failed: ${health.error}`));
      }
    } catch (err: unknown) {
      console.log(pc.red(`✖ Error: ${err instanceof Error ? err.message : String(err)}`));
    }
  } else {
    console.log(`  • OpenAI: ${pc.gray('(skipped - no OPENAI_API_KEY)')}`);
  }

  // Test Ollama
  const ollamaUrl = env.OLLAMA_BASE_URL || 'http://localhost:11434';
  process.stdout.write(`  • Ollama (${ollamaUrl}): `);
  try {
    const provider = new OllamaProvider({ baseURL: ollamaUrl });
    const health = await provider.checkHealth();
    if (health.healthy) {
      console.log(pc.green(`✔ Connected (${health.latencyMs}ms) [Models: ${health.models?.join(', ') || 'none'}]`));
    } else {
      console.log(pc.yellow(`! Unreachable or no models: ${health.error || 'Server did not respond'}`));
    }
  } catch (err: unknown) {
    console.log(pc.yellow(`! Unreachable: ${err instanceof Error ? err.message : String(err)}`));
  }

  console.log('');
}

/**
 * Runs the interactive CLI configuration wizard.
 */
export async function runInteractiveWizard(envFilePath: string): Promise<void> {
  const currentEnv = readEnvFile(envFilePath);
  const rl = createInterface({ input, output });

  try {
    console.log(pc.bold(pc.magenta('\n╭──────────────────────────────────────────────────╮')));
    console.log(pc.bold(pc.magenta('│     🌸 Ririko AI Interactive Setup Wizard        │')));
    console.log(pc.bold(pc.magenta('╰──────────────────────────────────────────────────╯\n')));

    console.log(pc.gray('This wizard will guide you through setting up your AI chat providers.'));
    console.log(pc.gray(`Configuration will be saved to: ${envFilePath}\n`));

    // 1. Choose primary provider
    const currentPrimary = (currentEnv.DEFAULT_AI_PROVIDER || 'gemini').toLowerCase();
    console.log(pc.bold('Step 1: Choose Primary AI Provider'));
    console.log(`  1. ${pc.cyan('Google Gemini')} (Recommended - Fast, Multimodal, Flagship)`);
    console.log(`  2. ${pc.cyan('OpenAI')} (GPT-4o, GPT-4o-mini, o3-mini)`);
    console.log(`  3. ${pc.cyan('Ollama / Local')} (Self-hosted, Private, Zero-cost)`);
    const defaultChoice = currentPrimary === 'openai' ? '2' : currentPrimary === 'ollama' ? '3' : '1';

    const providerAns = (
      await rl.question(`\nSelect provider [1-3] (default: ${defaultChoice}): `)
    ).trim() || defaultChoice;

    let selectedProvider: SupportedProvider = 'gemini';
    if (providerAns === '2' || providerAns.toLowerCase() === 'openai') {
      selectedProvider = 'openai';
    } else if (providerAns === '3' || providerAns.toLowerCase() === 'ollama') {
      selectedProvider = 'ollama';
    }

    const updates: Record<string, string | undefined> = {
      DEFAULT_AI_PROVIDER: selectedProvider,
    };

    console.log(pc.green(`\n✔ Primary provider set to: ${PROVIDER_METADATA[selectedProvider].name}\n`));

    // 2. Configure credentials for selected provider
    if (selectedProvider === 'gemini') {
      const existingKey = currentEnv.GEMINI_API_KEY;
      const promptText = existingKey
        ? `Enter Google Gemini API Key [Press enter to keep current: ${maskSecret(existingKey)}]: `
        : 'Enter Google Gemini API Key: ';

      const inputKey = (await rl.question(promptText)).trim();
      if (inputKey) {
        updates.GEMINI_API_KEY = inputKey;
      } else if (!existingKey) {
        console.log(pc.yellow('⚠ Note: Gemini API key is missing. AI chat will fall back until a key is added.'));
      }
    } else if (selectedProvider === 'openai') {
      const existingKey = currentEnv.OPENAI_API_KEY;
      const promptText = existingKey
        ? `Enter OpenAI API Key [Press enter to keep current: ${maskSecret(existingKey)}]: `
        : 'Enter OpenAI API Key: ';

      const inputKey = (await rl.question(promptText)).trim();
      if (inputKey) {
        updates.OPENAI_API_KEY = inputKey;
      }

      const existingBaseUrl = currentEnv.OPENAI_BASE_URL || '';
      const urlPrompt = existingBaseUrl
        ? `Custom Base URL (optional, e.g. for OpenRouter/Groq) [Press enter to keep: ${existingBaseUrl}]: `
        : 'Custom Base URL (optional, press enter to skip for standard api.openai.com): ';
      const inputUrl = (await rl.question(urlPrompt)).trim();
      if (inputUrl) {
        updates.OPENAI_BASE_URL = inputUrl;
      }
    } else if (selectedProvider === 'ollama') {
      const existingUrl = currentEnv.OLLAMA_BASE_URL || 'http://localhost:11434';
      const inputUrl = (
        await rl.question(`Enter Ollama Base URL [Press enter for: ${existingUrl}]: `)
      ).trim();
      updates.OLLAMA_BASE_URL = inputUrl || existingUrl;
    }

    // 3. Model selection
    const defaultModel =
      currentEnv.DEFAULT_AI_MODEL || PROVIDER_METADATA[selectedProvider].recommendedModel;
    console.log(pc.bold('\nStep 2: Default Model Selection'));
    console.log(`Available models for ${PROVIDER_METADATA[selectedProvider].name}:`);
    for (const m of PROVIDER_METADATA[selectedProvider].supportedModels) {
      console.log(`  • ${pc.cyan(m)}${m === defaultModel ? pc.yellow(' (default)') : ''}`);
    }

    const inputModel = (
      await rl.question(`\nEnter model name [Press enter for: ${defaultModel}]: `)
    ).trim();
    updates.DEFAULT_AI_MODEL = inputModel || defaultModel;

    // 4. Optional fallback setup
    console.log(pc.bold('\nStep 3: Secondary / Fallback Providers (Optional)'));
    const configureFallback = (
      await rl.question('Would you like to configure another provider for automated fallback? [y/N]: ')
    ).trim().toLowerCase();

    if (configureFallback === 'y' || configureFallback === 'yes') {
      if (selectedProvider !== 'gemini') {
        const gemKey = (
          await rl.question(
            `Enter Google Gemini API Key [Press enter to keep/skip: ${maskSecret(currentEnv.GEMINI_API_KEY)}]: `,
          )
        ).trim();
        if (gemKey) updates.GEMINI_API_KEY = gemKey;
      }

      if (selectedProvider !== 'openai') {
        const oaiKey = (
          await rl.question(
            `Enter OpenAI API Key [Press enter to keep/skip: ${maskSecret(currentEnv.OPENAI_API_KEY)}]: `,
          )
        ).trim();
        if (oaiKey) updates.OPENAI_API_KEY = oaiKey;
      }

      if (selectedProvider !== 'ollama') {
        const ollama = (
          await rl.question(
            `Enter Ollama URL [Press enter to keep/skip: ${currentEnv.OLLAMA_BASE_URL || 'none'}]: `,
          )
        ).trim();
        if (ollama) updates.OLLAMA_BASE_URL = ollama;
      }
    }

    // 5. Test Connectivity
    console.log('');
    const shouldTest = (
      await rl.question('Would you like to test connectivity with these providers now? [Y/n]: ')
    ).trim().toLowerCase();

    const mergedEnv = { ...currentEnv, ...updates } as Record<string, string>;

    if (shouldTest !== 'n' && shouldTest !== 'no') {
      await testAiProviders(mergedEnv);
    }

    // 6. Confirmation & Save
    const confirmSave = (
      await rl.question(`\nSave updated configuration to ${envFilePath}? [Y/n]: `)
    ).trim().toLowerCase();

    if (confirmSave === 'n' || confirmSave === 'no') {
      console.log(pc.yellow('\n✖ Configuration changes discarded.'));
      return;
    }

    const result = updateEnvFile(envFilePath, updates);
    console.log(pc.green(pc.bold(`\n✔ Configuration successfully saved to ${result.filePath}!`)));
    console.log(
      pc.gray(
        `Updated keys: ${result.updatedKeys.concat(result.addedKeys).join(', ') || 'None'}`,
      ),
    );
    console.log(pc.cyan('\nTip: You can re-run this anytime using `ririko ai:configure` or `pnpm ai:configure`.\n'));
  } finally {
    rl.close();
  }
}

/**
 * Registers the `ai:configure` and `ai:config` CLI command.
 */
export function registerAiConfigureCommand(program: Command): void {
  program
    .command('ai:configure')
    .alias('ai:config')
    .description('Configure AI chat providers, API keys, models, and fallback chain')
    .option('-p, --provider <provider>', 'Primary AI provider (gemini, openai, ollama)')
    .option('-m, --model <model>', 'Default AI model name override')
    .option('--gemini-key <key>', 'Google Gemini API key')
    .option('--openai-key <key>', 'OpenAI API key')
    .option('--openai-base-url <url>', 'OpenAI / proxy base URL (e.g. OpenRouter/Groq)')
    .option('--ollama-url <url>', 'Ollama server base URL (default: http://localhost:11434)')
    .option('--show', 'Display current AI configuration (masked keys)')
    .option('--test', 'Test connection & health for configured AI providers')
    .option('-i, --interactive', 'Run guided interactive setup wizard')
    .option('-y, --yes', 'Apply changes without confirmation prompt')
    .option('--env-file <path>', 'Custom path to .env file to update')
    .action(async (options: AiConfigureOptions) => {
      const globalOpts = program.opts<{ config?: string }>();
      const envPath = resolveEnvFilePath(options.envFile ?? globalOpts.config);
      const currentEnv = readEnvFile(envPath);

      // 1. If only --show was requested
      if (options.show && !options.provider && !options.geminiKey && !options.openaiKey && !options.ollamaUrl && !options.model) {
        printAiStatus(currentEnv, envPath);
        if (options.test) {
          await testAiProviders(currentEnv);
        }
        return;
      }

      // 2. If only --test was requested
      if (options.test && !options.provider && !options.geminiKey && !options.openaiKey && !options.ollamaUrl && !options.model && !options.interactive) {
        printAiStatus(currentEnv, envPath);
        await testAiProviders(currentEnv);
        return;
      }

      // 3. Determine if interactive wizard should execute
      const hasFlags = Boolean(
        options.provider ||
        options.model ||
        options.geminiKey ||
        options.openaiKey ||
        options.openaiBaseUrl ||
        options.ollamaUrl ||
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
        if (!SUPPORTED_PROVIDERS.includes(p as SupportedProvider)) {
          console.error(
            pc.red(`\n✖ Invalid provider: '${options.provider}'. Must be one of: ${SUPPORTED_PROVIDERS.join(', ')}`),
          );
          process.exit(1);
        }
        updates.DEFAULT_AI_PROVIDER = p;
      }

      if (options.model) {
        updates.DEFAULT_AI_MODEL = options.model;
      }

      if (options.geminiKey !== undefined) {
        updates.GEMINI_API_KEY = options.geminiKey;
      }

      if (options.openaiKey !== undefined) {
        updates.OPENAI_API_KEY = options.openaiKey;
      }

      if (options.openaiBaseUrl !== undefined) {
        updates.OPENAI_BASE_URL = options.openaiBaseUrl;
      }

      if (options.ollamaUrl !== undefined) {
        updates.OLLAMA_BASE_URL = options.ollamaUrl;
      }

      if (Object.keys(updates).length > 0) {
        const result = updateEnvFile(envPath, updates);
        console.log(pc.green(`\n✔ Successfully updated AI configuration in ${result.filePath}:`));
        for (const k of [...result.updatedKeys, ...result.addedKeys]) {
          const val = updates[k];
          const isSecret = k.toLowerCase().includes('key') || k.toLowerCase().includes('secret');
          console.log(`  • ${pc.bold(k)} = ${pc.cyan(isSecret ? maskSecret(val) : val ?? '')}`);
        }

        if (options.test) {
          const updatedEnv = readEnvFile(envPath);
          await testAiProviders(updatedEnv);
        }
      } else {
        // No updates provided and not interactive: display status & help hint
        printAiStatus(currentEnv, envPath);
        console.log(pc.gray('Tip: Run `ririko ai:configure -i` for the interactive wizard or see `ririko ai:configure --help`.\n'));
      }
    });
}
