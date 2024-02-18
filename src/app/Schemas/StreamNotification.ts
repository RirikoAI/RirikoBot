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
export default Model as "StreamNotification";

export const addNotification = async (
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
};

/**
 * @param streamIds
 */
export const getStreamersWithUnnotified = async (streamIds) => {
  return Model.find({ stream_id: { $nin: streamIds } });
};

export const getNotifications = async () => {
  return Model.find({});
};

export const getNotificationsByStreamId = async (streamIds) => {
  return Model.find({ stream_id: { $in: streamIds } });
};

export const getNotification = async (
  guildId,
  twitchUserId,
  channelId,
  streamId
) => {
  return Model.findOne({
    guild_id: guildId,
    twitch_user_id: twitchUserId,
    channel_id: channelId,
    stream_id: streamId,
    notified: true,
  });
};
