module.exports = {
  config: {
    name: "skipto",
  },
  inVoiceChannel: true,
  run: async (client, message, args) => {
    const queue = client.player.getQueue(message);
    if (!queue)
      return message.channel.send(
        `${client.config.emoji.error} | There is nothing in the queue right now!`
      );
    if (!args[0]) {
      return message.channel.send(
        `${client.config.emoji.error} | Please provide time (in seconds) to go rewind!`
      );
    }
    const num = Number(args[0]);
    if (isNaN(num))
      return message.channel.send(
        `${client.config.emoji.error} | Please enter a valid number!`
      );
    await client.player.jump(message, num).then((song) => {
      message.channel.send({ content: `Skipped to: ${song.name}` });
    });
  },
};
