const axios = require("axios");
const { getStreamers } = require("app/Schemas/Streamer");

async function checkStreamers(streamerNames) {
  const clientId = "<redacted>";
  const clientSecret = "<redacted>";

  try {
    // Get OAuth token
    const tokenResponse = await axios.post(
      "https://id.twitch.tv/oauth2/token",
      null,
      {
        params: {
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
        },
      }
    );
    const accessToken = tokenResponse.data.access_token;

    // Get stream information
    const streamsResponse = await axios.get(
      "https://api.twitch.tv/helix/streams",
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          user_login: streamerNames,
        },
      }
    );

    const streamers = streamsResponse.data.data;
    let onlineStreamers = [];
    streamers.forEach((streamer) => {
      if (streamer.type === "live") {
        console.log(
          `[Twitch Notifier] Streamer ${streamer.user_login} is online, playing ${streamer.game_name}`
            .brightCyan
        );
        onlineStreamers.push(streamer.user_login);
      }
    });

    const offlineStreamers = streamerNames.filter(
      (element) => !onlineStreamers.includes(element)
    );

    offlineStreamers.forEach((streamer) => {
      console.log(`[Twitch Notifier] Streamer ${streamer} is offline`.cyan);
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

(async function () {
  require("handlers/mongoose")(false);

  const streamers = await getStreamers();

  const userIDs = streamers.map((streamer) => streamer.twitch_user_id);

  await checkStreamers(userIDs);

  // next step:
  /**
   * 1. check the subscribers db, and see if any of them subscribed to the online streamers in the array
   * 2. if subscribers to the online streamers found, check if a notification has been sent to their server
   * 3. if notification is not sent before: construct a discord embedable with:
   *    ['username', 'game image', 'game name', 'followers', 'total views', 'user image']
   * 4. send the embed to the channel of the subscribers
   * 5. win
   */
})();
