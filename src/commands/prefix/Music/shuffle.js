module.exports = {
  config: {
    name: "shuffle",
  },
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
