module.exports = {
  config: {
    name: "previous",
  },
  inVoiceChannel: true,

  run: async (client, message) => {
    const queue = client.player.getQueue(message);
    if (!queue)
      return message.channel.send(
        `${client.config.emoji.error} | There is nothing in the queue right now!`
      );
    const song = queue.previous();
    message.channel.send(
      `${client.config.emoji.success} | Now playing:\n${song.name}`
    );
  },
};
