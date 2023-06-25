/**
 * @author ZeroDiscord https://github.com/ZeroDiscord/Giveaway
 */
const Discord = require("discord.js"),
  { EmbedBuilder } = Discord,
  parsec = require("parsec"),
  messages = require("helpers/message");

let created = false;

module.exports = {
  config: {
    name: "giveaway-create",
    description: "Create a new giveaway (Wizard)",
    usage: "giveaway-create",
  },
  category: "Giveaways",
  owner: false,
  run: async (client, message) => {
    // If the member doesn't have enough permissions
    if (
      !message.member.permissions.has("ManageMessages") &&
      !message.member.roles.cache.some((r) => r.name === "Giveaways")
    ) {
      return message.reply(
        ":x: You need to have the manage messages permissions to start giveaways."
      );
    }

    const collector = message.channel.createMessageCollector({
      filter: (m) => m.author.id === message.author.id,
      time: 60000,
    });

    let xembed = new EmbedBuilder()
      .setTitle("Oops! Looks Like We Met A Timeout! 🕖")
      .setColor("#FF0000")
      .setDescription(
        "💥 Snap our luck!\n" +
          "You took too much time to decide!\n" +
          "Use ``giveaway-create`` again to start a new giveaway!\n" +
          "Try to respond within **30 seconds** this time!"
      )
      .setFooter({
        text: `${client.user.username}`,
        iconURL: client.user.displayAvatarURL(),
      })
      .setTimestamp();

    function waitingEmbed(title, desc) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({
              name: `${message.author.tag} + ' | Giveaway Setup'`,
              iconURL: message.member.displayAvatarURL(),
            })
            .setTitle("Giveaway " + title)
            .setDescription(desc + " within the next 60 seconds.")
            .setFooter({
              text: "Type 'cancel' to exit this process.",
              iconURL: client.user.displayAvatarURL(),
            })
            .setTimestamp()
            .setColor("#2F3136"),
        ],
      });
    }

    let winnerCount, channel, duration, prize, cancelled;

    await waitingEmbed("Prize", "Please send the giveaway prize");

    collector.on("collect", async (m) => {
      if (cancelled) return;

      async function failed(options, ...cancel) {
        if (typeof cancel[0] === "boolean")
          (cancelled = true) && (await m.reply(options));
        else {
          await m.reply(
            options instanceof EmbedBuilder ? { embeds: [options] } : options
          );
          return await waitingEmbed(...cancel);
        }
      }

      if (m.content === "cancel") {
        collector.stop();
        return await failed("Cancelled Giveaway Creation.", true);
      }

      switch (true) {
        case !prize: {
          if (m.content.length > 256)
            return await failed(
              "The prize can not be more than 256 characters.",
              "Prize",
              "Please send the giveaway prize"
            );
          else {
            prize = m.content;
            await waitingEmbed("Channel", "Please send the giveaway channel");
          }

          break;
        }

        case !channel: {
          let _channel;
          if (
            !(_channel =
              m.mentions.channels.first() ||
              m.guild.channels.cache.get(m.content))
          )
            return await failed(
              "Please send a valid channel / channel ID.",
              "Channel",
              "Please send the giveaway channel"
            );
          else if (!_channel.isTextBased())
            return await failed(
              "The channel must be a text channel.",
              "Channel",
              "Please send the giveaway channel"
            );
          else {
            channel = _channel;
            await waitingEmbed(
              "Winner Count",
              "Please send the giveaway winner count."
            );
          }

          break;
        }

        case !winnerCount: {
          let _w;
          if (!(_w = parseInt(m.content)))
            return await failed(
              "The number of winners must be an integer.",

              "Winner Count",
              "Please send the giveaway winner count."
            );
          if (_w < 1)
            return await failed(
              "Winner count must be more than 1.",
              "Winner Count",
              "Please send the giveaway winner count."
            );
          else if (_w > 15)
            return await failed(
              "Winner count must be less than 15.",
              "Winner Count",
              "Please send the giveaway winner count."
            );
          else {
            winnerCount = _w;
            await waitingEmbed("Duration", "Please send the giveaway duration");
          }

          break;
        }

        case !duration: {
          let _d;
          if (!(_d = parsec(m.content).duration))
            return await failed(
              "Please provide a valid duration.",
              "Duration",
              "Please send the giveaway duration"
            );
          if (_d > parsec("21d").duration)
            return await failed(
              "Duration must be less than 21 days!",
              "Duration",
              "Please send the giveaway duration"
            );
          else {
            duration = _d;
          }

          if (!created) {
            created = true;
            return client.giveawaysManager.start(channel, {
              prize,
              duration,
              winnerCount,
              hostedBy: client.config.hostedBy ? message.author : null,
              messages,
            });
          }
        }
      }
    });
    collector.on("end", (collected, reason) => {
      if (reason === "time" && !created) {
        message.reply({ embeds: [xembed] });
      } else {
        created = false;
      }
    });
  },
};
