module.exports = {
  config: {
    name: "playskip",
    aliases: ["ps"],
    description:
      "Play the given music straightaway, skipping currently playing music",
    usage: "playskip [song url or query]",
  },
  category: "Music",
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
      skip: true,
    });
  },
};
