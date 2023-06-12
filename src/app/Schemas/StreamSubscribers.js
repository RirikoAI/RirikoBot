const mongoose = require("mongoose");

const reqString = {
  type: String,
  required: true,
};

const Schema = new mongoose.Schema(
  {
    guild_id: reqString,
    twitch_user_id: reqString,
    channel_id: reqString,
    notified: {
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

const Model = mongoose.model("StreamSubscribers", Schema);

module.exports = {
  Subscriber: Model,
  addSubscribers: async (twitchUserIds, guildId, channelId) => {
    let streamers = [];
    twitchUserIds.each((userId) => {
      streamers.push({
        guild_id: guildId,
        channel_id: channelId,
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
};
