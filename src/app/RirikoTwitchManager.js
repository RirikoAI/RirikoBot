/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
const { Streamer } = require("app/Schemas/Streamer");
const { log } = require("../helpers/logger");
const { Subscriber } = require("./Schemas/StreamSubscribers");

/**
 * This is the Twitch Manager - it will accept requests from Guilds to subscribe to a Twitch user
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
(async () => {
  console.info("0------------------| Twitch Notifier Handler:".blue);
  log("[Twitch Notifier] is now ready...".yellow);
})();

// Example usage: Add Twitch streamers to the database and subscribe to their stream events
async function addStreamersAndSubscribers(twitchIds, guildId, channelId) {
  // first find if there are already existing streamers in the database
  const existingStreamers = await Streamer.find({
    twitch_user_id: { $in: twitchIds },
  });

  // insert existing ones into an array
  const existingIds = existingStreamers.map(
    (streamer) => streamer.twitch_user_id
  );

  // make a new array minus the existing
  const newIds = twitchIds.filter((id) => !existingIds.includes(id));
  const newStreamers = newIds.map((twitch_user_id) => ({
    twitch_user_id,
  }));

  // insert Streamers that isn't already existing in db
  await Streamer.insertMany(newStreamers);

  // find existing subscribers for the streamer
  const existingSubscribers = await Subscriber.find({
    twitch_user_id: { $in: twitchIds },
    guild_id: guildId,
    channel_id: channelId,
  });

  const existingSubIds = existingSubscribers.map(
    (streamer) => streamer.twitch_user_id
  );

  const newSubIds = twitchIds.filter((id) => !existingSubIds.includes(id));

  const newSubscribers = newSubIds.map((twitch_user_id) => ({
    twitch_user_id: twitch_user_id,
    guild_id: guildId,
    channel_id: channelId,
  }));

  // insert Subscribers into db
  await Subscriber.insertMany(newSubscribers);
}

module.exports = {
  addStreamersAndSubscribers,
};
