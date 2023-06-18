/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
const mongoose = require("mongoose");
const { Guild } = require("./Guild");

const reqString = {
  type: String,
  required: true,
};

const Schema = new mongoose.Schema(
  {
    guild_id: {
      ...reqString,
      ref: "guild",
    },
    twitch_user_id: reqString,
    channel_id: reqString,
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
    } catch (error) {
      console.error("Error adding streamers:", error);
    }
  },
  upsertSubscriber: async (guildId, twitchUserId, channelId) => {
    try {
      const filter = { guild_id: guildId, twitch_user_id: twitchUserId };
      const update = { channel_id: channelId };
      const options = { upsert: true, new: true };

      return await Model.findOneAndUpdate(filter, update, options).exec();
    } catch (error) {
      // Handle the error
      console.error("Error upserting data:", error);
      throw error;
    }
  },
  getSubscribers: async () => {
    return Model.find({});
  },
  getSubscribersByGuildId: async (guildId) => {
    return Model.find({ guild_id: guildId });
  },
  getSubscribersByUserId: async (userId) => {
    return Model.find({ twitch_user_id: userId });
  },
  getSubscribersByUserIdArray: async (userId) => {
    let guilds = [];
    let subs = await Model.find({ twitch_user_id: userId });
    subs.forEach((sub) => {
      guilds.push({
        guild_id: sub.guild_id,
        channel_id: sub.channel_id,
      });
    });
    return guilds;
  },
  updateSubscription: async (guildId, newChannelId) => {
    try {
      await Model.updateMany(
        { guild_id: guildId },
        { channel_id: newChannelId }
      );
    } catch (error) {
      console.error("Update error:", error);
    }
  },
  deleteSubscription: async (guildId, twitchUserId) => {
    try {
      const filter = {
        guild_id: guildId,
        twitch_user_id: { $regex: new RegExp(`^${twitchUserId}$`, "i") },
      };

      return await Model.deleteOne(filter).exec();
    } catch (error) {
      // Handle the error
      console.error("Error deleting data:", error);
      throw error;
    }
  },
};
