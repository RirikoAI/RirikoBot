module.exports = {
  config: {
    name: "repeat",
    aliases: ["loop", "rp"],
    description: "Enable or disable repeat",
    usage: "repeat off\nrepeat song\nrepeat queue",
  },
  category: "Music",
  inVoiceChannel: true,
  run: async (client, message, args) => {
    const queue = client.player.getQueue(message);
    if (!queue)
      return message.channel.send(
        `${client.config.emoji.error} | There is nothing playing!`
      );
    let mode = null;
    switch (args[0]) {
      case "off":
        mode = 0;
        break;
      case "song":
        mode = 1;
        break;
      case "queue":
        mode = 2;
        break;
    }
    mode = queue.setRepeatMode(mode);
    mode = mode ? (mode === 2 ? "Repeat queue" : "Repeat song") : "Off";
    message.channel.send(
      `${client.config.emoji.repeat} | Set repeat mode to \`${mode}\``
    );
  },
};
