let config;

try {
  config = require("../../config");
} catch (e) {}

/**
 * This section of code is proudly written by Ririko herself (up until a point)
 */

/**
 * @version 2
 * @returns {*|number} PORT Number
 */
export const port = () => {
  return process.env.PORT || config.PORT;
};

/**
 * @version 1
 * @returns {*|string} Language
 */
export const language = () => {
  return process.env.LANGUAGE || config.LANGUAGE;
};

/**
 * @version 1
 * @returns {*|string} Discord Prefix (e.g: !)
 */
export const discordPrefix = () => {
  return process.env.DISCORD_BOT_PREFIX || config.DISCORD.Prefix;
};

/**
 * @version 1
 * @returns {*|string} Discord token
 */
export const discordToken = () => {
  return process.env.DISCORD_BOT_TOKEN || config.DISCORD.DiscordToken;
};

/**
 * @version 1
 * @returns {*|string} Discord Bot ID
 */
export const discordBotID = () => {
  return process.env.DISCORD_BOT_ID || config.DISCORD.DiscordBotID;
};

/**
 * @version 1
 * @returns {string[]|*|*[]} Array of Discord IDs - Bot Owner
 */
export const discordBotOwners = () => {
  try {
    const env = process.env.DISCORD_OWNER_IDS;
    if (env) {
      return env.split(" ");
    } else {
      const cfg = config.DISCORD.Users?.Owners;
      if (cfg.length === 0) {
        return [];
      } else {
        return cfg;
      }
    }
  } catch (e) {
    return [];
  }
};

/**
 * @version 1
 * @returns {[string]|*|*[]} Arrays of Discord IDs - Allowed AI Users
 */
export const allowedAIUsers = () => {
  try {
    const env = process.env.DISCORD_AI_ALLOWED_USERS;
    if (env) {
      return env.split(" ");
    } else {
      const cfg = config.DISCORD.Users?.AIAllowedUsers;
      if (cfg.length === 0) {
        return [];
      } else {
        return cfg;
      }
    }
  } catch (e) {
    return [];
  }
};

/**
 * @version 1
 * @returns {*|string} Discord Prefix for AI features (e.g: .)
 */
export const AIPrefix = () => {
  return process.env.DISCORD_AI_PREFIX || config.AI.Prefix;
};

/**
 * @version 1
 * @returns {*|string} AI provider
 */
export const AIProvider = () => {
  return process.env.AI_PROVIDER || config.AI.Provider;
};

/**
 * @version 1
 * @returns {*|string} AI token
 */
export const AIToken = () => {
  return process.env.AI_TOKEN || config.AI.AIToken;
};

/**
 * @version 1
 * @returns {*|boolean} If AI features allowed for certain users only
 */
export const AIEnableWhitelist = () => {
  return process.env.AI_ENABLE_WHITELIST || config.AI.EnableWhitelist;
};

/**
 * @version 2
 * @returns {string[]} Get AI personality
 */
export const AIPersonality = () => {
  return config.AI.Personality;
};

/**
 * @version 2
 * @returns {*|string} Get prompts / AI features
 */
export const AIPrompts = () => {
  return config.AI.Prompts;
};

/**
 * @version 1
 * @returns {*|string} DB engine
 */
export const dbEngine = () => {
  return process.env.DB_ENGINE || config.DATABASE.Engine;
};

/**
 * @version 1
 * @returns {*|string} MongoDB access URI with username, password (optional database name)
 */
export const mongoAccessURI = () => {
  return process.env.MONGODB_ACCESS_URI || config.DATABASE.MongoDB.AccessURI;
};

/**
 * @version 1
 * @returns {*|number} Debug Level
 */
export const debugLevel = () => {
  return process.env.DEBUG_LEVEL || config.DEBUG.Level;
};

/**
 * @version 1
 * @returns {*|string} The directory to store logs
 */
export const logDirectory = () => {
  return process.env.LOG_DIR || config.DEBUG.LogDir;
};

/**
 * @version 2
 * @returns {string|string}
 */
export const twitchClientId = () => {
  return process.env.TWITCH_CLIENT_ID || config.TWITCH.TwitchClientId;
};

/**
 * @version 2
 * @returns {string|string}
 */
export const twitchClientSecret = () => {
  return process.env.TWITCH_CLIENT_SECRET || config.TWITCH.TwitchClientSecret;
};

/**
 * @version 3
 * @returns {*|string}
 */
export const geniusToken = () => {
  return process.env.GENIUS_TOKEN || config.GENIUS_TOKEN;
};

/**
 * @version 3
 * @returns {*|string}
 */
export const geniusEnabled = () => {
  return process.env.GENIUS_ENABLED === "true" ? true : config.GENIUS_ENABLED;
};

/**
 * @version 3
 * @returns {*|string}
 */
export const lyristUrl = () => {
  return process.env.LYRIST_URL || config.LYRIST_URL;
};

/**
 * @version 3
 * @returns {*|string}
 */
export const lyristEnabled = () => {
  return process.env.LYRIST_ENABLED === "true" ? true : config.LYRIST_ENABLED;
};

/**
 * @version 5
 * @returns {*|string}
 */
export const replicateToken = () => {
  return process.env.REPLICATE_TOKEN || config.StableDiffusion.ReplicateToken;
};

/**
 * @returns {*|string}
 */
export const hostname = () => {
  // read .env file and get the hostname
  return process.env.HOSTNAME || "localhost";
};

/**
 * @version 7
 * @returns {*|string} AI token
 */
export const localAIServerURL = () => {
  return process.env.AI_LOCAL_SERVER_URL || config.AI.LocalServerURL;
};
