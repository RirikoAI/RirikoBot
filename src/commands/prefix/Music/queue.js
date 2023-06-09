module.exports = {
  config: {
    name: "queue",
    aliases: ["q"],
    description: "Show the server queue",
    usage: "queue",
  },
  category: "Music",
  run: async (client, message) => {
    const queue = client.player.getQueue(message);
    if (!queue)
      return message.channel.send(
        `${client.config.emoji.error} | There is nothing playing!`
      );
    const q = queue.songs
      .map(
        (song, i) =>
          `${i === 0 ? "Playing:" : `${i}.`} ${song.name} - \`${
            song.formattedDuration
          }\``
      )
      .join("\n");
    message.channel.send(
      `${client.config.emoji.queue} | **Server Queue**\n${q}`
    );
  },
};
