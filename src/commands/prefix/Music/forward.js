module.exports = {
  config: {
    name: "forward",
    description: "Fast forward the music by given time in seconds",
    usage: "forward [time in seconds]",
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
        `${client.config.emoji.error} | Please provide time (in seconds) to go forward!`
      );
    }
    const time = Number(args[0]);
    if (isNaN(time))
      return message.channel.send(
        `${client.config.emoji.error} | Please enter a valid number!`
      );
    queue.seek(queue.currentTime + time);
    message.channel.send(`Forwarded the song for ${time}!`);
  },
};
