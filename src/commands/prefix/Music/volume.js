module.exports = {
  config: {
    name: "volume",
    aliases: ["v", "set", "set-volume"],
  },
  inVoiceChannel: true,
  run: async (client, message, args) => {
    const queue = client.player.getQueue(message);
    if (!queue)
      return message.channel.send(
        `${client.config.emoji.error} | There is nothing in the queue right now!`
      );
    const volume = parseInt(args[0]);
    if (isNaN(volume))
      return message.channel.send(
        `${client.config.emoji.error} | Please enter a valid number!`
      );
    queue.setVolume(volume);
    message.channel.send(
      `${client.config.emoji.success} | Volume set to \`${volume}\``
    );
  },
};
