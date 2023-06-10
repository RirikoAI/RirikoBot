const express = require("express");
const { port } = require("helpers/getconfig");
const app = express();
const colors = require("colors");

// Define a route to handle webhook notifications
app.post("/webhook/twitch", (req, res) => {
  const event = req.body; // The webhook payload will be available in the request body
  console.log("Received webhook:", event);
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Ririko says: Hello!");
});

// Start the server
app.listen(port(), () => {
  console.log("[Ririko Web Server] Ready to serve the world.".yellow);
  console.log(`[Ririko Web Server] Server listening on port ${port()}`.yellow);
});
