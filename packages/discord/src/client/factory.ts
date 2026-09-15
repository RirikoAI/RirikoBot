import {
  ActivityType,
  Client,
  GatewayIntentBits,
  Partials,
  type ClientOptions,
  type SweeperOptions,
} from 'discord.js';
import type { DiscordClientConfig } from './types.js';

/**
 * Standard Gateway intents required for Ririko AI 2.0.0.
 * Covers Guilds, Members, Messages (including content for prefix commands), Reactions, and Voice.
 */
export const DEFAULT_GATEWAY_INTENTS: GatewayIntentBits[] = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.MessageContent,
];

/**
 * Standard Gateway partials enabling handling of uncached historical messages, reactions, and channels.
 */
export const DEFAULT_PARTIALS: Partials[] = [
  Partials.Message,
  Partials.Channel,
  Partials.Reaction,
  Partials.User,
  Partials.GuildMember,
];

/**
 * Default cache sweepers to ensure lean memory usage in high-volume production deployments.
 * Sweeps messages and threads older than 1 hour every 30 minutes.
 */
export const DEFAULT_SWEEPERS: SweeperOptions = {
  messages: {
    interval: 1800,
    lifetime: 3600,
  },
  threads: {
    interval: 1800,
    lifetime: 3600,
  },
};

/**
 * Creates a Discord.js 14 Client configured with production-grade intents, partials, and sweepers.
 */
export function createDiscordClient(config: DiscordClientConfig = {}): Client {
  const options: ClientOptions = {
    intents: config.intents ?? DEFAULT_GATEWAY_INTENTS,
    partials: config.partials ?? DEFAULT_PARTIALS,
    sweepers: {
      ...DEFAULT_SWEEPERS,
      ...config.sweepers,
    },
    allowedMentions: config.allowedMentions ?? {
      parse: ['users'],
      repliedUser: true,
    },
    failIfNotExists: false,
    presence: config.presence ?? {
      activities: [
        {
          name: 'Ririko AI 2.0.0',
          type: ActivityType.Playing,
        },
      ],
      status: 'online',
    },
    ...config.clientOptions,
  };

  if (config.shards !== undefined) {
    options.shards = config.shards;
  }
  if (config.shardCount !== undefined) {
    options.shardCount = config.shardCount;
  }

  return new Client(options);
}
