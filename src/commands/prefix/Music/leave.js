module.exports = {
  config: {
    name: "leave",
  },
  run: async (client, message) => {
    client.player.voices.leave(message);
  },
};
