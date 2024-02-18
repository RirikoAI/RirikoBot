module.exports = {
  config: {
    name: "volume",
    aliases: ["v", "set", "set-volume"],
    description: "Set/get the server volume",
    usage: "volume\nvolume [number]",
  },
  category: "Music",
  inVoiceChannel: true,
  run: async (client, message, args, prefix, config, db) => {
    const queue = client.player.getQueue(message);

    if (!args[0]) {
      const volume = +(await db.get(
        `guild_volume_${message.channel.guild.id}`
      ));
      message.channel.send(`Current volume set was \`${volume}\``);
      return;
    }

    const volume = parseInt(args[0]);
    if (isNaN(volume))
      return message.channel.send(
        `${client.config.emoji.error} | Please enter a valid number!`
      );

    const newVolume = await db.set(`guild_volume_${message.guild.id}`, args[0]);

    try {
      queue.setVolume(volume);
    } catch (e) {}

    message.channel.send(
      `${client.config.emoji.success} | Volume set to \`${newVolume}\``
    );
  },
};
