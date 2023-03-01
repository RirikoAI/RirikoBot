module.exports = {
  config: {
    name: "autoplay",
    aliases: ["p"],
    description: "Toggle autoplay on or off.",
    usage: "autoplay [on/off]",
  },
  inVoiceChannel: true,
  run: async (client, message) => {
    const queue = client.player.getQueue(message);
    if (!queue)
      return message.channel.send(
        `${client.config.emoji.error} | There is nothing in the queue right now!`
      );
    const autoplay = queue.toggleAutoplay();
    message.channel.send(
      `${client.config.emoji.success} | AutoPlay: \`${
        autoplay ? "On" : "Off"
      }\``
    );
  },
};
