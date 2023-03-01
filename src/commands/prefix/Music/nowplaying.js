module.exports = {
  config: {
    name: "nowplaying",
    aliases: ["np"],
  },
  inVoiceChannel: true,
  run: async (client, message, args) => {
    const queue = client.player.getQueue(message);
    if (!queue)
      return message.channel.send(
        `${client.config.emoji.error} | There is nothing in the queue right now!`
      );
    const song = queue.songs[0];
    message.channel.send(
      `${client.config.emoji.play} | I'm playing **\`${song.name}\`**, by ${song.user}`
    );
  },
};
