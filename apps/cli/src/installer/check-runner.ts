import {
  checkComfyUi,
  checkDatabase,
  checkDiscordApplication,
  checkDiscordOAuthSecret,
  checkGemini,
  checkLavalink,
  checkOllama,
  checkOpenAi,
  checkReplicate,
  checkSpotify,
  checkTwitch,
  checkYouTube,
  type CheckDeps,
  type CheckResult,
} from './checks.js';
import { answerValue, type Answers, type CheckId } from './steps.js';

/**
 * Connects the wizard's page checks (`CheckId`) to the check functions of TASK-1922: which answers
 * each check reads, and which field shows its error.
 */

/** `true` when the Lavalink connection is secure; only the source install asks (Docker is plain). */
function lavalinkSecure(answers: Answers): string {
  return answerValue(answers, 'LAVALINK_SECURE') === 'true' ? 'true' : 'false';
}

/** The answers a check reads, in a fixed order. A check passed for these values stays valid. */
export function checkInputs(id: CheckId, answers: Answers): string[] {
  const v = (name: string): string => answerValue(answers, name);
  switch (id) {
    case 'discord-bot':
      return [v('DISCORD_TOKEN'), v('DISCORD_CLIENT_ID')];
    case 'ai-provider': {
      const provider = v('DEFAULT_AI_PROVIDER');
      if (provider === 'openai') return [provider, v('OPENAI_API_KEY'), v('OPENAI_BASE_URL')];
      if (provider === 'ollama') return [provider, v('OLLAMA_BASE_URL')];
      return [provider, v('GEMINI_API_KEY')];
    }
    case 'image-provider': {
      const provider = v('IMAGE_DEFAULT_PROVIDER');
      if (provider === 'replicate') return [provider, v('REPLICATE_API_TOKEN')];
      if (provider === 'comfyui') return [provider, v('COMFYUI_URL')];
      return [provider, v('GEMINI_API_KEY')];
    }
    case 'twitch':
      return [v('TWITCH_CLIENT_ID'), v('TWITCH_CLIENT_SECRET')];
    case 'youtube':
      return [v('YOUTUBE_API_KEY')];
    case 'spotify':
      return [v('SPOTIFY_CLIENT_ID'), v('SPOTIFY_CLIENT_SECRET')];
    case 'postgres':
      return [v('DATABASE_URL')];
    case 'lavalink':
      return [
        v('LAVALINK_HOST'),
        v('LAVALINK_PORT'),
        v('LAVALINK_PASSWORD'),
        lavalinkSecure(answers),
      ];
    case 'dashboard-oauth':
      return [v('DISCORD_CLIENT_ID'), v('DISCORD_CLIENT_SECRET')];
  }
}

/**
 * The field that shows the error of a failed check. A Lavalink answer of 401 or 403 names the
 * password; any other Lavalink failure names the address.
 */
export function checkField(id: CheckId, answers: Answers, result?: CheckResult): string {
  const v = (name: string): string => answerValue(answers, name);
  switch (id) {
    case 'discord-bot':
      return 'DISCORD_TOKEN';
    case 'ai-provider': {
      const provider = v('DEFAULT_AI_PROVIDER');
      if (provider === 'openai') return 'OPENAI_API_KEY';
      if (provider === 'ollama') return 'OLLAMA_BASE_URL';
      return 'GEMINI_API_KEY';
    }
    case 'image-provider': {
      const provider = v('IMAGE_DEFAULT_PROVIDER');
      if (provider === 'replicate') return 'REPLICATE_API_TOKEN';
      if (provider === 'comfyui') return 'COMFYUI_URL';
      return 'GEMINI_API_KEY';
    }
    case 'twitch':
      return 'TWITCH_CLIENT_SECRET';
    case 'youtube':
      return 'YOUTUBE_API_KEY';
    case 'spotify':
      return 'SPOTIFY_CLIENT_SECRET';
    case 'postgres':
      return 'DATABASE_URL';
    case 'lavalink':
      return result?.detail?.httpStatus === 401 || result?.detail?.httpStatus === 403
        ? 'LAVALINK_PASSWORD'
        : 'LAVALINK_HOST';
    case 'dashboard-oauth':
      return 'DISCORD_CLIENT_SECRET';
  }
}

/** Runs one check with the wizard's answers. The check functions never throw. */
export function runInstallerCheck(
  id: CheckId,
  answers: Answers,
  deps: CheckDeps = {},
): Promise<CheckResult> {
  const v = (name: string): string => answerValue(answers, name);
  switch (id) {
    case 'discord-bot':
      return checkDiscordApplication(
        { token: v('DISCORD_TOKEN'), applicationId: v('DISCORD_CLIENT_ID') },
        deps,
      );
    case 'ai-provider': {
      const provider = v('DEFAULT_AI_PROVIDER');
      if (provider === 'openai') {
        const baseUrl = v('OPENAI_BASE_URL');
        return checkOpenAi(
          { apiKey: v('OPENAI_API_KEY'), baseUrl: baseUrl === '' ? undefined : baseUrl },
          deps,
        );
      }
      if (provider === 'ollama') return checkOllama(v('OLLAMA_BASE_URL'), deps);
      return checkGemini(v('GEMINI_API_KEY'), deps);
    }
    case 'image-provider': {
      const provider = v('IMAGE_DEFAULT_PROVIDER');
      if (provider === 'replicate') return checkReplicate(v('REPLICATE_API_TOKEN'), deps);
      if (provider === 'comfyui') return checkComfyUi(v('COMFYUI_URL'), deps);
      return checkGemini(v('GEMINI_API_KEY'), deps);
    }
    case 'twitch':
      return checkTwitch(
        { clientId: v('TWITCH_CLIENT_ID'), clientSecret: v('TWITCH_CLIENT_SECRET') },
        deps,
      );
    case 'youtube':
      return checkYouTube(v('YOUTUBE_API_KEY'), deps);
    case 'spotify':
      return checkSpotify(
        { clientId: v('SPOTIFY_CLIENT_ID'), clientSecret: v('SPOTIFY_CLIENT_SECRET') },
        deps,
      );
    case 'postgres':
      return checkDatabase({ dialect: 'postgres', url: v('DATABASE_URL') }, deps);
    case 'lavalink':
      return checkLavalink(
        {
          host: v('LAVALINK_HOST'),
          port: v('LAVALINK_PORT'),
          password: v('LAVALINK_PASSWORD'),
          secure: lavalinkSecure(answers) === 'true',
        },
        deps,
      );
    case 'dashboard-oauth':
      return checkDiscordOAuthSecret(
        { applicationId: v('DISCORD_CLIENT_ID'), clientSecret: v('DISCORD_CLIENT_SECRET') },
        deps,
      );
  }
}
