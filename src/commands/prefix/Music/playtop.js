module.exports = {
  config: {
    name: "playtop",
    aliases: ["pt"],
  },
  inVoiceChannel: true,
  run: async (client, message, args) => {
    const string = args.join(" ");
    if (!string)
      return message.channel.send(
        `${client.config.emoji.error} | Please enter a song url or query to search.`
      );
    client.player.play(message.member.voice.channel, string, {
      member: message.member,
      textChannel: message.channel,
      message,
      position: 1,
    });
  },
};
