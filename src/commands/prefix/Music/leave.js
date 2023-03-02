module.exports = {
  config: {
    name: "leave",
    description: "Leave/disconnect from the voice channel",
    usage: "leave",
  },
  run: async (client, message) => {
    client.player.voices.leave(message);
  },
};
