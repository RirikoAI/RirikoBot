module.exports = {
  config: {
    name: "shuffle",
    description: "Shuffles / randomizes the current playing queue",
    usage: "shuffle",
  },
  category: "Music",
  inVoiceChannel: true,
  run: async (client, message) => {
    const queue = client.player.getQueue(message);
    if (!queue)
      return message.channel.send(
        `${client.config.emoji.error} | There is nothing in the queue right now!`
      );
    queue.shuffle();
    message.channel.send("Shuffled songs in the queue");
  },
};
