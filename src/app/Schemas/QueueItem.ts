import { exp } from "mathjs";

/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
const mongoose = require("mongoose");

const Schema = new mongoose.Schema({
  data: Object,
  type: {
    type: String,
    required: true,
    enum: ["Twitch_Notification"],
  },

  processed: { type: Boolean, default: false },
});

const Model = mongoose.model("QueueItem", Schema);

export default Model as "QueueItem";

export const addQueueItems = async (queueItems) => {
  await Model.insertMany(queueItems);
};

export const deleteQueueItems = async () => {
  return Model.deleteMany({});
};

export const getQueuedItems = async () => {
  return Model.find({});
};

export const deleteQueueItemById = async (_id) => {
  return Model.deleteOne({
    _id: _id,
  });
};
