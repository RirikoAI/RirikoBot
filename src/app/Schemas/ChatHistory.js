const mongoose = require("mongoose");

const Schema = new mongoose.Schema(
  {
    guild_id: String,
    last_channel_id: String,
    last_message_id: String,
    user_id: String,
    chat_history: String,
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: true,
    },
  }
);

const Model = mongoose.model("chathistory", Schema);

module.exports = {
  model: Model,

  addChatHistory: async (message, chat_history) => {
    return new Model({
      guild_id: message.guildId,
      last_channel_id: message.channelId,
      last_message_id: message.id,
      user_id: message.author.id,
      chat_history: chat_history,
    }).save();
  },

  updateChatHistory: async (guildId, userId, newChatHistory) => {
    return Model.findOneAndUpdate(
      { guild_id: guildId, user_id: userId },
      {
        chat_history: newChatHistory,
      }
    );
  },

  findChatHistory: async (guildId, userId) => {
    return Model.findOne({ guild_id: guildId, user_id: userId });
  },

  deleteChatHistory: async (guildId, userId) => {
    return Model.findOneAndDelete({ guild_id: guildId, user_id: userId });
  },
};
