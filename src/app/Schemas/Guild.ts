import { AIPrefix } from "helpers/getconfig";

const mongoose = require("mongoose");
const {CACHE_SIZE, DISCORD, STATS} = require("../../../config/config");
const FixedSizeMap = require("fixedsize-map");
const {getUser} = require("./User");

const cache = new FixedSizeMap(CACHE_SIZE.GUILDS);

const Schema = new mongoose.Schema({
  _id: String,
  data: {
    name: String,
    region: String,
    owner: {type: String, ref: "users"},
    joinedAt: Date,
    leftAt: Date,
    bots: {type: Number, default: 0},
  },
  prefix: {type: String, default: DISCORD.Prefix},
  stats: {
    enabled: Boolean,
    xp: {
      message: {type: String, default: STATS.DEFAULT_LVL_UP_MSG},
      channel: String,
    },
  },
  ticket: {
    log_channel: String,
    limit: {type: Number, default: 10},
    categories: [
      {
        _id: false,
        name: String,
        staff_roles: [String],
      },
    ],
  },
  aichatbot: {
    enabled: {type: Boolean, default: false},
    prefix: {type: String, default: "."},
  },
  autovoicechannel: {
    enabled: {type: Boolean, default: false},
    primary_channels: [String],
  },
  twitch: {
    enabled: {
      type: Boolean,
      default: false,
    },
    channel: String,
  },
  automod: {
    debug: Boolean,
    strikes: {type: Number, default: 10},
    action: {type: String, default: "TIMEOUT"},
    wh_channels: [String],
    anti_attachments: Boolean,
    anti_invites: Boolean,
    anti_links: Boolean,
    anti_spam: Boolean,
    anti_ghostping: Boolean,
    anti_massmention: Number,
    max_lines: Number,
  },
  invite: {
    tracking: Boolean,
    ranks: [
      {
        invites: {type: Number, required: true},
        _id: {type: String, required: true},
      },
    ],
  },
  flag_translation: {
    enabled: Boolean,
  },
  modlog_channel: String,
  max_warn: {
    action: {
      type: String,
      enum: ["TIMEOUT", "KICK", "BAN"],
      default: "KICK",
    },
    limit: {type: Number, default: 5},
  },
  counters: [
    {
      _id: false,
      counter_type: String,
      name: String,
      channel: String,
    },
  ],
  welcome: {
    enabled: {type: Boolean, default: false},
    channel: String,
    content: String,
    message: {type: String, default: "Welcome to {server} {user}!"},
    embed: {
      description: String,
      color: String,
      thumbnail: Boolean,
      footer: String,
      image: String,
    },
  },
  farewell: {
    enabled: {type: Boolean, default: false},
    channel: String,
    content: String,
    message: {type: String, default: "Goodbye {user}!"},
    embed: {
      description: String,
      color: String,
      thumbnail: Boolean,
      footer: String,
      image: String,
    },
  },
  autorole: {
    enabled: {type: Boolean, default: false},
    role_id: String,
  },
  reactionroles: {
    enabled: {type: Boolean, default: false},
  },
  musicplayer: {
    enabled: {type: Boolean, default: true},
    cover_url: String,
    now_playing: String,
    current_time: String,
    maximum_time: String,
    requested_by: String,
    dj_user_id: String
  },
  suggestions: {
    enabled: Boolean,
    channel: String,
    approved_channel: String,
    rejected_channel: String,
    staff_roles: [String],
  },
});

const Model = mongoose.models.guild || mongoose.model("guild", Schema);

module.exports = {
  Guild: Model,
  getAllSettings: async () => {
    return Model.find({});
  },
  /**
   * @param {string} guildId
   */
  getSettings: async (guildId) => {
    if (!guildId) throw new Error("Guild is undefined");
    
    // const cached = cache.get(guild.id);
    // if (cached) return cached;
    
    // cache.add(guild.id, guildData);
    return Model.findOne({
      _id: guildId,
    });
  },
  /**
   * @param {import('discord.js').Guild} guild
   */
  updateGuildOwner: async (guild) => {
    let guildData = await Model.findById(guild.id);
    if (!guildData) {
      // save owner details
      guild
        .fetchOwner()
        .then(async (owner) => {
          const userDb = await getUser(owner);
          await userDb.save();
        })
        .catch((ex) => {
        });
      
      // create a new guild model
      guildData = new Model({
        _id: guild.id,
        data: {
          name: guild.name,
          region: guild.preferredLocale,
          owner: guild.ownerId,
          joinedAt: guild.joinedAt,
        },
      });
      
      await guildData.save();
    }
  },
  setSettings: upsertNestedKeyValuePair,
  deleteSettings: deleteNestedKeyValuePair,
};

// Function to insert or update a nested key-value pair
async function upsertNestedKeyValuePair(guild, nestedPath, key, value) {
  if (!guild) throw new Error("Guild is undefined");
  if (!guild.id) throw new Error("Guild Id is undefined");
  try {
    const document = await Model.findById(guild.id);
    setNestedValue(document, nestedPath, key, value);
    return await document.save();
    // console.log("Nested key-value pair upserted successfully.");
  } catch (error) {
    console.error("Error upserting nested key-value pair:", error);
  }
}

// Function to delete a nested key-value pair
async function deleteNestedKeyValuePair(guild, nestedPath, key) {
  if (!guild) throw new Error("Guild is undefined");
  if (!guild.id) throw new Error("Guild Id is undefined");
  try {
    const document = await Model.findById(guild.id);
    deleteNestedValue(document, nestedPath, key);
    await document.save();
    // console.log("Nested key-value pair deleted successfully.");
  } catch (error) {
    console.error("Error deleting nested key-value pair:", error);
  }
}

// Helper function to set a nested key-value pair
function setNestedValue(obj, path, key, value) {
  const keys = path.split(".");
  let currentObj = obj;
  for (let i = 0; i < keys.length; i++) {
    const currentKey = keys[i];
    if (i === keys.length - 1) {
      currentObj[currentKey][key] = value;
    } else {
      currentObj = currentObj[currentKey];
    }
  }
}

// Helper function to delete a nested key
function deleteNestedValue(obj, path, key) {
  const keys = path.split(".");
  let currentObj = obj;
  for (let i = 0; i < keys.length; i++) {
    const currentKey = keys[i];
    if (i === keys.length - 1) {
      delete currentObj[currentKey][key];
    } else {
      currentObj = currentObj[currentKey];
    }
  }
}
