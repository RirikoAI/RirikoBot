const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "help",
  description: "Replies with pong!",
  type: 1,
  options: [],
  permissions: {
    DEFAULT_MEMBER_PERMISSIONS: "SendMessages",
  },
  run: async (client, interaction, config, db) => {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            "xban [user] [days] [reason] - banning people from current server.\n" +
              "`xbassboost` <none|low|medium|high> - Enables bass boosting audio effect\n" +
              "`xbump` - Moves a track to the front of the queue.\n" +
              "`xcleanup` [message to clean up] - Moderation command to clean up messages in the channel. shortcut (clup)\n" +
              "`xclear` - Clears the server queue\n" +
              "`xconfig` - Edit the bot settings\n" +
              "`xdisconnect` - Stop the music and leave the voice channel\n" +
              "`xgrab` - Saves the current song to your Direct Messages\n" +
              "xhelp [command] - Information about the bot\n" +
              "`xinvite` - To invite me to your server\n" +
              "`xloop` - Loop the current song\n" +
              "`xloopqueue` - Loop the whole queue\n" +
              "xlyrics [Song Name] - Shows the lyrics of the song searched\n" +
              "`xmove` - Moves a track to a specified position.\n" +
              "`xn4d` - ned4cped your self :3\n" +
              "`xnowplaying` - See what song is currently playing\n" +
              "`xparamtest` [Return Tester - Parameter Tester\n" +
              "`xpause` - Pauses the music\n" +
              "xplay [song] - Play your favorite songs\n" +
              "`xqueue` - Shows all currently enqueued songs\n" +
              "xremove [number] - Remove a song from the queue\n" +
              "`xresume` - Resumes the music\n" +
              "xsearch [song] - Shows a result of songs based on the search query\n" +
              "xseek <time s/m/h> - Seek to a position in the song\n" +
              "`xshuffle` - Shuffles the queue\n" +
              "`xskip` - Skip the current song\n" +
              "xskipto <number> - Skip to a song in the queue\n" +
              "`xstats` - Get information about the bot\n" +
              "xuser <@user> - Snipe Profile Picture org especially aiman\n" +
              "xvolume <volume> - Check or change the current volume\n" +
              "`xyoutube` - Starts a YouTube Together session"
          )
          .setColor("Blue"),
      ],
      ephemeral: false,
    });
    await interaction.followUp("Pong again!");
  },
};
