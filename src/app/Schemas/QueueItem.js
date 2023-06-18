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

module.exports = {
  QueueItem: Model,
  addQueueItems: async (queueItems) => {
    await Model.insertMany(queueItems);
  },
  getQueuedItems: async () => {
    return Model.find({});
  },

  deleteQueueItems: async () => {
    return Model.deleteMany({});
  },
  deleteQueueItemById: async (_id) => {
    return Model.deleteOne({
      _id: _id,
    });
  },
};
