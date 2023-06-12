const express = require("express");
const { port } = require("helpers/getconfig");
const app = express();
const colors = require("colors");

const { overrideLoggers } = require("helpers/logger");
overrideLoggers();

console.info("0------------------| Ririko Express (Web Server):".brightCyan);

// Endpoint to handle incoming webhook notifications
app.post("/webhook/twitch/notification/:twitchId", async (req, res) => {
  const twitchId = req.params.twitchId;

  // Verify the request using the secret (if you set one)
  // Implement your own verification logic here

  // Extract the relevant information from the request body
  const { event, data } = req.body;

  // Process the event data and send notifications
  if (event === "stream.online") {
    const streamerName = data[0].user_name;
    console.info(`${streamerName} started streaming!`);

    // Add your own notification logic here (e.g., send an email, push notification, etc.)
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Ririko says: Hello!");
});

// Start the server
app.listen(port(), () => {
  console.info("[Ririko Express] Ready to serve the world.".yellow);
  console.info(`[Ririko Express] Server listening on port ${port()} \n`.yellow);
});
