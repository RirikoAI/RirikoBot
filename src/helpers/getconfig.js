const config = require("../../config");

const language = () => {
  return process.env.LANGUAGE || config.LANGUAGE;
};

const discordPrefix = () => {
  return process.env.DISCORD_BOT_PREFIX || config.DISCORD.Prefix;
};

const discordToken = () => {
  return process.env.DISCORD_BOT_TOKEN || config.DISCORD.Token;
};

const discordBotID = () => {
  return process.env.DISCORD_BOT_ID || config.DISCORD.ID;
};

const discordBotOwners = () => {
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

const allowedAIUsers = () => {
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

const AIPrefix = () => {
  return process.env.DISCORD_AI_PREFIX || config.AI.Prefix;
};

const AIProvider = () => {
  return process.env.AI_PROVIDER || config.AI.Provider;
};

const AIToken = () => {
  return process.env.AI_TOKEN || config.AI.Token;
};

const AIEnableWhitelist = () => {
  return process.env.AI_ENABLE_WHITELIST || config.AI.EnableWhitelist;
};

const dbEngine = () => {
  return process.env.DB_ENGINE || config.DATABASE.Engine;
};

const mongoAccessURI = () => {
  return process.env.MONGODB_ACCESS_URI || config.DATABASE.MongoDB.AccessURI;
};

const debugLevel = () => {
  return process.env.DEBUG_LEVEL || config.DEBUG.Level;
};

const logDirectory = () => {
  return process.env.LOG_DIR || config.DEBUG.LogDir;
};

module.exports = {
  discordPrefix,
  discordToken,
  discordBotID,
  discordBotOwners,
  allowedAIUsers,
  AIPrefix,
  AIProvider,
  AIToken,
  AIEnableWhitelist,
  dbEngine,
  mongoAccessURI,
  debugLevel,
  logDirectory,
};
