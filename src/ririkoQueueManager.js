/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
import { discordToken } from "./helpers/getconfig";

const colors = require("colors");

import { deleteQueueItemById, getQueuedItems } from "./app/Schemas/QueueItem";
import { addNotification } from "./app/Schemas/StreamNotification";

const { overrideLoggers } = require("helpers/logger");
overrideLoggers();

console.info("[Ririko Queue Manager] Started".brightMagenta);

const { Client, Intents, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const token = discordToken();

client.on("messageCreate", async (message) => {
  //
});

client.once("ready", async () => {
  console.info("[Ririko Queue Manager] is Ready".brightMagenta);
  let iteration = 1;

  require("handlers/mongoose")(false, "Queue Manager", true);

  setInterval(async function () {
    // console.info(
    //   `[Ririko Queue Manager] Running iteration #${iteration}`.brightMagenta
    // );
    iteration++;
    await run();
  }, 60 * 500);
});

client.login(token);

/**
 * This is the Queue Manager. It accepts queue from services like Stream Checker,
 * and then will perform tasks accordingly (e.g. Announce to a Guild that a streamer is live)
 *
 * The queue manager will also connect to Discord API
 *
 * Queue that checks for tasks* every second and runs the task as per category.
 *
 * Type of tasks
 * - Announce to Discord channels
 * - Message Discord members
 * - Vote reminders
 */

async function run() {
  const queuedItems = await getQueuedItems();

  queuedItems.forEach((job) => {
    checkJob(job);
  });
}

async function sendMessage(guildId, channelId, message) {
  //const guildId = "755618872920637440"; // Replace with the desired guild ID
  //const channelId = "1078598260488413275"; // Replace with the desired channel ID
  try {
    const guild = await client.guilds.fetch(guildId);

    guild.channels.cache.get(channelId).send(message);
  } catch (e) {
    console.error("Something went wrong when trying to send message ", e);
    throw e;
  }
}

function checkJob(job) {
  switch (job.type) {
    case "Twitch_Notification":
      runTwitchEmbedJob(job.data, job._id);
      break;
  }
}

async function runTwitchEmbedJob(data, jobId) {
  const message = {
    content: `${data.display_name} is live!`,
    tts: false,
    embeds: [
      {
        type: "rich",
        title: `${data.title}`,
        description: "",
        color: 7419530,
        fields: [
          {
            name: `Followers`,
            value: `${data.followers}`,
            inline: true,
          },
          {
            name: `Total Views`,
            value: `${data.totalViews}`,
            inline: true,
          },
          {
            name: `Type`,
            value: `${data.broadcaster_type}`,
            inline: true,
          },
        ],
        image: {
          url: `${data.streamImageUrl}`,
          height: 0,
          width: 0,
        },
        thumbnail: {
          url: `${data.profile_image_url}`,
          height: 300,
          width: 300,
        },
        author: {
          name: `${data.display_name}`,
        },
        footer: {
          text: `Playing: ${data.gameName}`,
        },
        url: `https://twitch.tv/${data.username}`,
      },
    ],
  };
  for (const subscriber of data.streamSubscribers) {
    try {
      await sendMessage(subscriber.guild_id, subscriber.channel_id, message);
      await addNotification(
        data.login,
        subscriber.guild_id,
        subscriber.channel_id,
        data.stream_id,
        true
      );
      await deleteQueueItemById(jobId);
    } catch (e) {
      console.log(
        "[Ririko Queue Manager] Something went wrong when running the twitch embed job"
          .red,
        e
      );
    }
  }
}
