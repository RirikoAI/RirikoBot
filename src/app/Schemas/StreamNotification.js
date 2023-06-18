/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
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
    stream_id: reqString,
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

const Model = mongoose.model("StreamNotifications", Schema);

module.exports = {
  StreamNotification: Model,
  addNotification: async (
    twitchUserId,
    guildId,
    channelId,
    streamId,
    notified
  ) => {
    try {
      // Insert streamers into the collection
      await Model.insertMany({
        guild_id: guildId,
        twitch_user_id: twitchUserId,
        channel_id: channelId,
        stream_id: streamId,
        notified: notified,
      });
    } catch (error) {
      console.error("Error adding stream notification:", error);
    }
  },
  /**
   * @param  streamIds array
   */
  getStreamersWithUnnotified: async (streamIds) => {
    return Model.find({ stream_id: { $nin: streamIds } });
  },
  getNotifications: async () => {
    return Model.find({});
  },
  getNotificationsByStreamId: async (streamIds) => {
    return Model.find({ stream_id: { $in: streamIds } });
  },
  getNotification: async (guildId, twitchUserId, channelId, streamId) => {
    return Model.findOne({
      guild_id: guildId,
      twitch_user_id: twitchUserId,
      channel_id: channelId,
      stream_id: streamId,
      notified: true,
    });
  },
};
