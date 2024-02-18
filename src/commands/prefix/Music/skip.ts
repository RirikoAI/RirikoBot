module.exports = {
  config: {
    name: "skip",
    description: "Skip the current music",
    usage: "skip",
  },
  category: "Music",
  inVoiceChannel: true,
  run: async (client, message) => {
    const queue = client.player.getQueue(message);
    if (!queue)
      return message.channel.send(
        `${client.config.emoji.error} | There is nothing in the queue right now!`
      );
    try {
      const song = await queue.skip();
      message.channel.send(
        `${client.config.emoji.success} | Skipped! Now playing:\n${song.name}`
      );
    } catch (e) {
      message.channel.send(`${client.config.emoji.error} | ${e}`);
    }
  },
};
