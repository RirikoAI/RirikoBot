const config = require("../../config");

const language = () => {
  return config.LANGUAGE || process.env.LANGUAGE;
};

const discordPrefix = () => {
  return config.DISCORD.Prefix || process.env.DISCORD_BOT_PREFIX;
};

const discordToken = () => {
  return config.DISCORD.Token || process.env.DISCORD_BOT_TOKEN;
};

const discordBotID = () => {
  return config.DISCORD.ID || process.env.DISCORD_BOT_ID;
};

const discordBotOwners = () => {
  try {
    const cfg = config.DISCORD.Users?.Owners;
    if (cfg.length === 0) {
      const env = process.env.DISCORD_OWNER_IDS;
      return env.split(" ");
    } else {
      return cfg;
    }
  } catch (e) {
    return [];
  }
};

const allowedAIUsers = () => {
  try {
    const cfg = config.DISCORD.Users?.AIAllowedUsers;
    if (cfg.length === 0) {
      const env = process.env.DISCORD_AI_ALLOWED_USERS;
      return env.split(" ");
    } else {
      return cfg;
    }
  } catch (e) {
    return [];
  }
};

const AIPrefix = () => {
  return config.AI.Prefix || process.env.DISCORD_AI_PREFIX;
};

const AIProvider = () => {
  return config.AI.Provider || process.env.AI_PROVIDER;
};

const AIToken = () => {
  return config.AI.Token || process.env.AI_TOKEN;
};

const AIEnableWhitelist = () => {
  return config.AI.EnableWhitelist || process.env.AI_ENABLE_WHITELIST;
};

const dbEngine = () => {
  return config.DATABASE.Engine || process.env.DB_ENGINE;
};

const mongoAccessURI = () => {
  return config.DATABASE.MongoDB.AccessURI || process.env.MONGODB_ACCESS_URI;
};

const debugLevel = () => {
  return config.DEBUG.Level || process.env.DEBUG_LEVEL;
};

const logDirectory = () => {
  return config.DEBUG.LogDir || process.env.LOG_DIR;
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
