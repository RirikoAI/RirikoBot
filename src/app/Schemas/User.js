const mongoose = require("mongoose");
const { CACHE_SIZE } = require("config");
const FixedSizeMap = require("fixedsize-map");

const cache = new FixedSizeMap(CACHE_SIZE.USERS);

const Schema = new mongoose.Schema(
  {
    _id: String,
    username: String,
    discriminator: String,
    logged: Boolean,
    coins: { type: Number, default: 0 },
    bank: { type: Number, default: 0 },
    reputation: {
      received: { type: Number, default: 0 },
      given: { type: Number, default: 0 },
      timestamp: Date,
    },
    daily: {
      streak: { type: Number, default: 0 },
      timestamp: Date,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

const Model = mongoose.models.user || mongoose.model("user", Schema);

module.exports = {
  /**
   * @param {import('discord.js').User} user
   */
  getUser: async (user) => {
    if (!user) throw new Error("User is required.");
    if (!user.id) throw new Error("User Id is required.");

    const cached = cache.get(user.id);
    if (cached) return cached;

    let userDb = await Model.findById(user.id);
    if (!userDb) {
      userDb = new Model({
        _id: user.id,
        username: user.username,
        discriminator: user.discriminator,
      });
    }

    // Temporary fix for users who where added to DB before v5.0.0
    // Update username and discriminator in previous DB
    else if (!userDb.username || !userDb.discriminator) {
      userDb.username = user.username;
      userDb.discriminator = user.discriminator;
    }

    cache.add(user.id, userDb);
    return userDb;
  },

  getReputationLb: async (limit = 10) => {
    return Model.find({ "reputation.received": { $gt: 0 } })
      .sort({ "reputation.received": -1, "reputation.given": 1 })
      .limit(limit)
      .lean();
  },
};
