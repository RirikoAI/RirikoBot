module.exports = {
  config: {
    name: "filter",
    aliases: ["filters"],
    description:
      "Displays or clear the current audio filter in place." +
      "\nSet a new filter by issuing slash command /filter [option]",
    usage: "filter\nfilter off",
  },
  category: "Music",
  inVoiceChannel: true,
  run: async (client, message, args) => {
    const queue = client.player.getQueue(message);
    if (!queue)
      return message.channel.send(
        `${client.config.emoji.error} | There is nothing in the queue right now!`
      );
    const filter = args[0];
    if (filter === "off" && queue.filters.size) queue.filters.clear();
    else if (Object.keys(client.player.filters).includes(filter)) {
      if (queue.filters.has(filter)) queue.filters.remove(filter);
      else queue.filters.add(filter);
    } else if (args[0])
      return message.channel.send(
        `${client.config.emoji.error} | Not a valid filter`
      );
    message.channel.send(
      `Current Queue Filter: \`${queue.filters.names.join(", ") || "Off"}\``
    );
  },
};
