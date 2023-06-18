/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
const mongoose = require("mongoose");
const { boolean } = require("mathjs");

const reqString = {
  type: String,
  required: true,
};

const Schema = new mongoose.Schema(
  {
    twitch_user_id: {
      type: String,
      required: true,
      unique: true,
    },
    is_live: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

const Model = mongoose.model("Streamer", Schema);
module.exports = {
  Streamer: Model,
  addStreamers: async (twitchUserIds) => {
    let streamers = [];
    twitchUserIds.each((userId) => {
      streamers.push({
        twitch_user_id: userId,
      });
    });

    try {
      // Insert streamers into the collection
      await Model.insertMany(streamers);
      console.info("Streamers added successfully!");
    } catch (error) {
      console.error("Error adding streamers:", error);
    }
  },
  deleteStreamer: async (twitchUserIds, guildId) => {
    return Model.findOneAndDelete({
      guild_id: guildId,
      twitch_user_id: twitchUserIds,
    });
  },
  getStreamers: async () => {
    return Model.find({});
  },
};
