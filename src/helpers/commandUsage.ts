const mongoose = require("mongoose");

const commandUsageSchema = new mongoose.Schema({
  memberId: { type: String, required: true },
  commandName: { type: String, required: true },
  usageCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 24 * 60 * 60 }, // Set expiration time to 24 hours
});

export const CommandUsageModel = mongoose.model(
  "CommandUsage",
  commandUsageSchema
);

export async function getAndIncrementUsageCount(memberId, limit, commandName) {
  let commandUsage = await CommandUsageModel.findOne({
    memberId: memberId,
    commandName: commandName,
  });

  if (commandUsage?.usageCount >= limit) {
    throw new Error(
      `You have reached the usage limit for this command. [${limit} uses per day]`
    );
  }

  commandUsage = await CommandUsageModel.findOneAndUpdate(
    { memberId: memberId, commandName: commandName },
    { $inc: { usageCount: 1 }, lastUsageTimestamp: new Date() },
    { upsert: true, new: true }
  );

  return commandUsage.usageCount;
}

module.exports = {
  CommandUsageModel,
  getAndIncrementUsageCount,
};
