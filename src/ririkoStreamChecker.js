/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 * @type {axios.AxiosStatic | axios | AxiosStatic | {all<T>(values: Array<Promise<T> | T>): Promise<T[]>, AxiosInterceptorOptions: AxiosInterceptorOptions, AxiosResponse: AxiosResponse, Axios: Axios, ParamsSerializerOptions: ParamsSerializerOptions, ParamEncoder: ParamEncoder, AxiosDefaults: AxiosDefaults, AxiosInterceptorManager: AxiosInterceptorManager, ResponseType: "arraybuffer" | "blob" | "document" | "json" | "text" | "stream", AxiosBasicCredentials: AxiosBasicCredentials, AxiosProxyConfig: AxiosProxyConfig, RawAxiosRequestHeaders: RawAxiosRequestHeaders, Method: "get" | "GET" | "delete" | "DELETE" | "head" | "HEAD" | "options" | "OPTIONS" | "post" | "POST" | "put" | "PUT" | "patch" | "PATCH" | "purge" | "PURGE" | "link" | "LINK" | "unlink" | "UNLINK", FormDataVisitorHelpers: FormDataVisitorHelpers, AxiosRequestConfig: AxiosRequestConfig, SerializerVisitor: SerializerVisitor, AxiosAdapter: AxiosAdapter, CancelStatic: CancelStatic, AxiosStatic: AxiosStatic, AxiosRequestHeaders: RawAxiosRequestHeaders & AxiosHeaders, AxiosPromise: Promise<AxiosResponse<T>>, InternalAxiosRequestConfig: InternalAxiosRequestConfig, GenericHTMLFormElement: GenericHTMLFormElement, CanceledError: CanceledError, RawAxiosRequestConfig: AxiosRequestConfig<D>, HeadersDefaults: HeadersDefaults, GenericFormData: GenericFormData, AxiosHeaderValue: AxiosHeaders | string | string[] | number | boolean, CancelTokenStatic: CancelTokenStatic, Canceler: Canceler, FormSerializerOptions: FormSerializerOptions, spread<T, R>(callback: (...args: T[]) => R): (array: T[]) => R, Cancel: Cancel, CancelTokenSource: CancelTokenSource, CancelToken: CancelToken, AxiosError: AxiosError, toFormData(sourceObj: object, targetFormData?: GenericFormData, options?: FormSerializerOptions): GenericFormData, AxiosProgressEvent: AxiosProgressEvent, responseEncoding: "ascii" | "ASCII" | "ansi" | "ANSI" | "binary" | "BINARY" | "base64" | "BASE64" | "base64url" | "BASE64URL" | "hex" | "HEX" | "latin1" | "LATIN1" | "ucs-2" | "UCS-2" | "ucs2" | "UCS2" | "utf-8" | "UTF-8" | "utf8" | "UTF8" | "utf16le" | "UTF16LE", isAxiosError<T=any, D=any>(payload: any): payload is AxiosError<T, D>, TransitionalOptions: TransitionalOptions, HttpStatusCode: HttpStatusCode, CustomParamsSerializer: CustomParamsSerializer, GenericAbortSignal: GenericAbortSignal, AxiosResponseHeaders: RawAxiosResponseHeaders & AxiosHeaders, CreateAxiosDefaults: CreateAxiosDefaults, formToJSON(form: (GenericFormData | GenericHTMLFormElement)): object, AxiosInstance: AxiosInstance, AxiosRequestTransformer: AxiosRequestTransformer, SerializerOptions: SerializerOptions, AxiosHeaders: AxiosHeaders, isCancel(value: any): value is Cancel, AxiosResponseTransformer: AxiosResponseTransformer, RawAxiosResponseHeaders: RawAxiosResponseHeaders, readonly default: AxiosStatic}}
 */
const axios = require("axios");
const { getStreamers } = require("app/Schemas/Streamer");
const {
  Subscriber,
  getSubscribersByUserId,
  getSubscribersByUserIdArray,
} = require("app/Schemas/StreamSubscribers");
const { overrideLoggers } = require("helpers/logger");
overrideLoggers();
const { twitchClientId, twitchClientSecret } = require("helpers/getconfig");
const redis = require("redis");
const { det } = require("mathjs");
const { addQueueItems, deleteQueueItems } = require("./app/Schemas/QueueItem");
const { getNotification } = require("./app/Schemas/StreamNotification");
const { addStreamersAndSubscribers } = require("./app/RirikoTwitchManager");
const { getAllSettings } = require("./app/Schemas/Guild");

const clientId = twitchClientId();
const clientSecret = twitchClientSecret();

let tokenResponse, accessToken;
let retries = 0,
  max_retries = 15;
let iteration = 1;

(async function () {
  require("handlers/mongoose")(false, "Stream Checker", true);

  // initial run
  console.info(`[Ririko Stream Checker] is ready.`.brightBlue);
  await run();

  setInterval(async function () {
    // console.info(
    //   `[Ririko Stream Checker] Running iteration #${iteration}`.brightBlue
    // );
    iteration++;
    await run();
  }, 60 * 1000);
})();

async function run() {
  const streamerIDs = await getStreamers();

  /**
   * This code extracts the twitch_user_id values from each object in the streamerIDs array
   * and creates a new array called userIDs containing those extracted values.
   */
  const userIDs = streamerIDs.map((streamer) => streamer.twitch_user_id);

  const streams = await checkStreamers(userIDs);

  // fetch streamer's details, online only
  const streamerDetails = await fetchStreamersInfo(streams);

  await pushEmbedJob(streamerDetails);
}

async function twitchLogin() {
  if (retries <= 5) {
    // Get OAuth token
    tokenResponse = await axios.post(
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
    accessToken = tokenResponse.data.access_token;
    retries++;
  } else {
    console.error(`Max retries (${retries}/${max_retries}) reached.`);
  }
}

/**
 * This is the Twitch Stream checker, it's sole job is just to fetch info of streamers regardless of Discord servers (subscribers)
 * @param streamerNames
 * @returns {Promise<{onlineStreamers: *[], offlineStreamers: *}>}
 */
async function checkStreamers(streamerNames) {
  let streamIdsArray = [],
    onlineStreamersArray = [];
  if (!accessToken) await twitchLogin();
  try {
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

    // online streamers
    streamers.forEach((streamer) => {
      streamIdsArray.push(streamer.id);
      if (streamer.type === "live") {
        // console.info(
        //   `[Twitch Notifier] Streamer ${streamer.user_login} is online, playing ${streamer.game_name}`
        //     .brightCyan
        // );
        onlineStreamersArray.push(streamer.user_login);
      }
    });

    const offlineStreamers = streamerNames.filter(
      (element) => !onlineStreamersArray.includes(element)
    );

    offlineStreamers.forEach((streamer) => {
      // console.info(`[Twitch Notifier] Streamer ${streamer} is offline`.cyan);
    });

    return {
      onlineStreamersArray: onlineStreamersArray,
      offlineStreamersArray: offlineStreamers,
      onlineStreamers: streamers,
      streamIdsArray: streamIdsArray,
    };
  } catch (error) {
    console.error("Error:", error.message);
  }
}

/**
 * This function pushes a job containing discord embed of online streamers.
 * It also checks whether the discord servers has received the notification or not
 * @param streamerDetails
 */
async function pushEmbedJob(streamerDetails) {
  const settings = await getAllSettings();
  if (!streamerDetails) return;
  await deleteQueueItems();
  let queueItems = [];

  for (const details of streamerDetails) {
    // count number of notification sent to a guild
    let notifications = 0;
    // loop through subscribers (Discord guilds/servers) and push embed jobs for each subscriber
    for (const sub of details.streamSubscribers) {
      // filter guilds with notification off
      const guildSettings = settings.filter(
        (setting) => setting._id === sub.guild_id
      );
      const notification = await getNotification(
        sub.guild_id,
        details.username,
        sub.channel_id,
        details.stream_id
      );

      if (notification) notifications++;
      // only add to queue if no notification ever sent
      if (notifications === 0 && guildSettings[0]?.twitch?.enabled) {
        queueItems.push({
          data: details,
          type: "Twitch_Notification",
        });
      }
    }
  }
  return addQueueItems(queueItems);
}

// online streamers only
async function fetchStreamersInfo(streams) {
  if (streams.onlineStreamers.length === 0) return;
  if (!accessToken) await twitchLogin();

  let onlineStreamers = [],
    streamerDetails = [],
    users;

  // Make a request to the Twitch API to retrieve user information
  await axios
    .get(`https://api.twitch.tv/helix/users`, {
      headers: {
        "Client-ID": clientId,
        Accept: "application/vnd.twitchtv.v5+json",
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        login: streams.onlineStreamersArray,
      },
    })
    .then((response) => {
      users = response.data.data;
    })
    .catch((error) => {
      console.error("Error retrieving follower count:", error);
      console.error("Retry auth");
      twitchLogin();
    });

  users.forEach((details) => {
    streamerDetails.push({
      user_id: details.id,
      login: details.login,
      display_name: details.display_name,
      type: details.type,
      broadcaster_type: details.broadcaster_type
        ? details.broadcaster_type
        : "normal",
      description: details.description,
      profile_image_url: details.profile_image_url,
      offline_image_url: details.offline_image_url,
      created_at: details.created_at,
    });
  });

  // loop through online streamers from the param
  for (const streamer of streams.onlineStreamers) {
    let followerCount;
    // Make a request to the Twitch API to retrieve user information
    await axios
      .get(
        `https://api.twitch.tv/helix/users/follows?to_id=${streamer.user_id}`,
        {
          headers: {
            "Client-ID": clientId,
            Accept: "application/vnd.twitchtv.v5+json",
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      .then((response) => {
        followerCount = response.data.total;
      })
      .catch((error) => {
        console.error("Error retrieving follower count:", error);
        console.error("Retry auth");
        twitchLogin();
      });

    // fetch stream image urls, game name, followers, total views, user image
    onlineStreamers.push({
      stream_id: streamer.id,
      user_id: streamer.user_id,
      username: streamer.user_login,
      streamImageUrl: streamer.thumbnail_url
        .replace("{width}", "320")
        .replace("{height}", "180"),
      gameName: streamer.game_name,
      followers: followerCount,
      totalViews: streamer.viewer_count,
      userImage: "",
      title: streamer.title,
      streamSubscribers: await getSubscribersByUserIdArray(streamer.user_login),
    });
  }

  // merge /helix/stream + follower count with /helix/users
  onlineStreamers = streamerDetails.map((item) => {
    const matchingItem = onlineStreamers.find((otherItem) => {
      return otherItem.user_id === item.user_id;
    });
    return { ...item, ...matchingItem };
  });

  return onlineStreamers;
}
