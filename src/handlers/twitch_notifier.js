/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
const { Streamer } = require("app/Schemas/Streamer");
const { log } = require("../helpers/logger");
const { Subscriber } = require("../app/Schemas/StreamSubscribers");

/**
 * Register twitch stream notifier
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 *
 * @param client
 * @param config
 * @returns {boolean}
 */
module.exports = async (client, config) => {
  console.log("0------------------| Twitch Notifier Handler:".blue);
  log("[Twitch Notifier] Adding streamers into database...".yellow);

  // for each guild, add streamers
  // Add Twitch streamers to the database and subscribe to their stream events
  await addStreamersAndSubscribers(
    ["amouranth", "zizaran", "z_boub_", "wardell", "peachling", "buffedzelda"],
    "<redacted>",
    "<redacted>"
  );
};

// Example usage: Add Twitch streamers to the database and subscribe to their stream events
async function addStreamersAndSubscribers(twitchIds, guildId, channelId) {
  const existingStreamers = await Streamer.find({
    twitch_user_id: { $in: twitchIds },
  });

  const existingIds = existingStreamers.map(
    (streamer) => streamer.twitch_user_id
  );

  const newIds = twitchIds.filter((id) => !existingIds.includes(id));

  const newStreamers = newIds.map((twitch_user_id) => ({
    twitch_user_id,
  }));

  // insert Streamers into db
  await Streamer.insertMany(newStreamers);

  const existingSubscribers = await Subscriber.find({
    twitch_user_id: { $in: twitchIds },
    guild_id: guildId,
    channel_id: channelId,
  });

  const existingSubIds = existingSubscribers.map(
    (streamer) => streamer.twitch_user_id
  );

  console.log("existingSubscribers", existingSubscribers);

  const newSubIds = twitchIds.filter((id) => !existingSubIds.includes(id));

  const newSubscribers = newSubIds.map((twitch_user_id) => ({
    twitch_user_id: twitch_user_id,
    guild_id: guildId,
    channel_id: channelId,
  }));

  // insert Subscribers into db
  await Subscriber.insertMany(newSubscribers);
}
