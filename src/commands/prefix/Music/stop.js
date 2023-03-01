module.exports = {
  config: {
    name: "stop",
    aliases: ["disconnect", "leave"],
  },
  inVoiceChannel: true,
  run: async (client, message) => {
    const queue = client.player.getQueue(message);
    if (!queue)
      return message.channel.send(
        `${client.config.emoji.error} | There is nothing in the queue right now!`
      );
    queue.stop();
    message.channel.send(`${client.config.emoji.success} | Stopped!`);
  },
};
