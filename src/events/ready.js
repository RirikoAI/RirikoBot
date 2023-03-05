const client = require("ririko");
const colors = require("colors");

const { cacheReactionRoles } = require("app/Schemas/ReactionRoles");
const { getSettings } = require("app/Schemas/Guild");

module.exports = {
  name: "ready.js",
};

client.once("ready", async () => {
  // Load reaction roles to cache
  await cacheReactionRoles(client);

  for (const guild of client.guilds.cache.values()) {
    const settings = await getSettings(guild);
  }

  console.log(
    "\n" + `[READY] ${client.user.tag} is up and ready to go.`.brightGreen
  );
});
