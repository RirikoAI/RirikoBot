module.exports = {
  config: {
    name: "pause",
    aliases: ["pause", "hold"],
    description: "Pause or unpause currently playing music",
    usage: "pause",
  },
  category: "Music",
  inVoiceChannel: true,
  run: async (client, message) => {
    const queue = client.player.getQueue(message);
    if (!queue)
      return message.channel.send(
        `${client.config.emoji.error} | There is nothing in the queue right now!`
      );
    if (queue.paused) {
      queue.resume();
      return message.channel.send("Resumed the song for you :)");
    }
    queue.pause();
    message.channel.send("Paused the song for you :)");
  },
};
