module.exports = {
  config: {
    name: "resume",
    aliases: ["resume", "unpause"],
    description: "Resume or unpause music",
    usage: "resume",
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
      message.channel.send("Resumed the song for you :)");
    } else {
      message.channel.send("The queue is not paused!");
    }
  },
};
