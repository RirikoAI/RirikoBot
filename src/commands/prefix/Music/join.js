const { Constants } = require("discord.js");

module.exports = {
  config: {
    name: "join",
    aliases: ["move"],
  },
  run: async (client, message, args) => {
    let voiceChannel = message.member.voice.channel;
    if (args[0]) {
      voiceChannel = await client.channels.fetch(args[0]);
      if (!Constants.VoiceBasedChannelTypes.includes(voiceChannel?.type)) {
        return message.channel.send(
          `${client.config.emoji.error} | ${args[0]} is not a valid voice channel!`
        );
      }
    }
    if (!voiceChannel) {
      return message.channel.send(
        `${client.config.emoji.error} | You must be in a voice channel or enter a voice channel id!`
      );
    }
    client.player.voices.join(voiceChannel);
  },
};
