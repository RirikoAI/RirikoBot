module.exports = {
  config: {
    name: "seek",
    description: "Jump / seek currently playing music to a given time",
    usage: "seek [position in seconds]",
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
        `${client.config.emoji.error} | Please provide position (in seconds) to seek!`
      );
    }
    const time = Number(args[0]);
    if (isNaN(time))
      return message.channel.send(
        `${client.config.emoji.error} | Please enter a valid number!`
      );
    queue.seek(time);
    message.channel.send(`Seeked to ${time}!`);
  },
};
