import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createDatabaseClient, pingDatabase } from '@ririko/database';
import { DiagnosticCheck } from './types.js';

const execAsync = promisify(exec);

export const nodeCheck: DiagnosticCheck = {
  name: 'Node.js Runtime',
  required: true,
  run: () => {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0] ?? '0', 10);
    if (major >= 22) {
      return {
        status: 'pass',
        message: `Node.js (${version})`,
      };
    }
    return {
      status: 'fail',
      message: `Node.js version ${version} is below required Node.js 22+ LTS baseline`,
    };
  },
};

export const typescriptCheck: DiagnosticCheck = {
  name: 'TypeScript Compiler',
  required: true,
  run: async () => {
    try {
      const { stdout } = await execAsync('npx tsc -v');
      const version = stdout.trim();
      return {
        status: 'pass',
        message: `${version}`,
      };
    } catch {
      return {
        status: 'warn',
        message: 'TypeScript compiler binary not found via npx',
      };
    }
  },
};

export const databaseCheck: DiagnosticCheck = {
  name: 'Database Configuration',
  required: true,
  run: async () => {
    const dialect = (process.env.DATABASE_DIALECT || 'sqlite') as 'sqlite' | 'postgres';
    const dbUrl = process.env.DATABASE_URL || './data/ririko.sqlite';

    if (dialect !== 'sqlite' && dialect !== 'postgres') {
      return {
        status: 'fail',
        message: `Unsupported DATABASE_DIALECT '${dialect}'. Must be 'postgres' or 'sqlite'.`,
      };
    }

    if (dialect === 'postgres' && !process.env.DATABASE_URL) {
      return {
        status: 'fail',
        message: 'DATABASE_URL is required when DATABASE_DIALECT is postgres',
      };
    }

    try {
      const client = await createDatabaseClient({
        dialect,
        url: dbUrl,
        connectionTimeoutMs: 3000,
      });

      const ping = await pingDatabase(client);
      await client.close();

      if (ping.ok) {
        return {
          status: 'pass',
          message:
            dialect === 'sqlite'
              ? `SQLite Active (${dbUrl}, ${ping.latencyMs}ms)`
              : `PostgreSQL Connected (${dbUrl.replace(/:[^:@]+@/, ':****@')}, ${ping.latencyMs}ms)`,
        };
      }

      return {
        status: 'fail',
        message: `Database ping failed: ${ping.error ?? 'Unknown error'}`,
      };
    } catch (err: unknown) {
      return {
        status: 'fail',
        message: `Database initialization failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

export const discordTokenCheck: DiagnosticCheck = {
  name: 'Discord Token',
  required: true,
  run: () => {
    const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      return {
        status: 'fail',
        message: 'DISCORD_TOKEN (or DISCORD_BOT_TOKEN) not configured in environment',
      };
    }
    return {
      status: 'pass',
      message: `Configured (${token.slice(0, 6)}...${token.slice(-4)})`,
    };
  },
};

export const discordClientIdCheck: DiagnosticCheck = {
  name: 'Discord Client ID',
  required: true,
  run: () => {
    const clientId = process.env.DISCORD_CLIENT_ID || process.env.DISCORD_APPLICATION_ID;
    if (!clientId) {
      return {
        status: 'fail',
        message: 'DISCORD_CLIENT_ID (or DISCORD_APPLICATION_ID) not configured in environment',
      };
    }
    return {
      status: 'pass',
      message: `Configured (${clientId})`,
    };
  },
};

export const ffmpegCheck: DiagnosticCheck = {
  name: 'Audio Transcoder (FFmpeg)',
  required: false,
  run: async () => {
    try {
      await execAsync('ffmpeg -version');
      return {
        status: 'pass',
        message: 'FFmpeg detected in system PATH',
      };
    } catch {
      return {
        status: 'warn',
        message: 'FFmpeg not detected (Optional, needed for voice and music streaming)',
      };
    }
  },
};

export const geminiCheck: DiagnosticCheck = {
  name: 'Google Gemini AI',
  required: false,
  run: () => {
    if (process.env.GEMINI_API_KEY) {
      return {
        status: 'pass',
        message: 'Configured',
      };
    }
    return {
      status: 'warn',
      message: 'GEMINI_API_KEY not configured (Optional, needed for Gemini AI chatbot)',
    };
  },
};

export const openaiCheck: DiagnosticCheck = {
  name: 'OpenAI Provider',
  required: false,
  run: () => {
    if (process.env.OPENAI_API_KEY) {
      return {
        status: 'pass',
        message: 'Configured',
      };
    }
    return {
      status: 'warn',
      message: 'OPENAI_API_KEY not configured (Optional)',
    };
  },
};

export const twitchCheck: DiagnosticCheck = {
  name: 'Twitch Live Notifications',
  required: false,
  run: () => {
    if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
      return {
        status: 'pass',
        message: 'Configured',
      };
    }
    return {
      status: 'warn',
      message: 'TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not configured (Optional)',
    };
  },
};

export const spotifyCheck: DiagnosticCheck = {
  name: 'Spotify Music Resolver',
  required: false,
  run: () => {
    if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
      return {
        status: 'pass',
        message: 'Configured',
      };
    }
    return {
      status: 'warn',
      message: 'SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not configured (Optional)',
    };
  },
};

export const allChecks: DiagnosticCheck[] = [
  nodeCheck,
  typescriptCheck,
  databaseCheck,
  discordTokenCheck,
  discordClientIdCheck,
  ffmpegCheck,
  geminiCheck,
  openaiCheck,
  twitchCheck,
  spotifyCheck,
];
