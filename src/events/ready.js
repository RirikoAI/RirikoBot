const client = require("ririkoBot");
const colors = require("colors");
const { workerData, parentPort, isMainThread } = require("worker_threads");

const { cacheReactionRoles } = require("app/Schemas/ReactionRoles");
const { getSettings } = require("app/Schemas/Guild");
const NODE_ENV = process.env.NODE_ENV || "development";

module.exports = {
  name: "ready.js",
};

client.once("ready", async () => {
  // Load reaction roles to cache
  await cacheReactionRoles(client);

  for (const guild of client.guilds.cache.values()) {
    const settings = await getSettings(guild);
  }

  try {
    // Send "ready" signal to the main thread
    if (typeof parentPort !== "undefined") {
      parentPort.postMessage({
        ready: true,
        botUsername: client.user.tag,
      });
    }
  } catch (e) {
    console.log("NODE_ENV:".red, NODE_ENV);

    console.log(
      "\n" + `[READY] ${client.user.tag} is up and ready to go.`.brightGreen
    );

    console.log(
      "\n=============================================================\n".white
    );
  }
});
