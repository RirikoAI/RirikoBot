/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot/
 */
const { purgeMessages } = require("helpers/ModUtils");
const { ApplicationCommandOptionType, ChannelType } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "purge",
  description: "purge commands",
  category: "MODERATION",
  type: 1,
  permissions: ["ManageMessages"],
  command: {
    enabled: true,
    ephemeral: true,
  },
  options: [
    {
      name: "all",
      description: "purge all messages",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "channel",
          description: "channel from which messages must be cleaned",
          type: ApplicationCommandOptionType.Channel,
          channelTypes: [ChannelType.GuildText],
          required: true,
        },
        {
          name: "amount",
          description: "number of messages to be deleted (Max 99)",
          type: ApplicationCommandOptionType.Integer,
          required: false,
        },
      ],
    },
    {
      name: "attachments",
      description: "purge all messages with attachments",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "channel",
          description: "channel from which messages must be cleaned",
          type: ApplicationCommandOptionType.Channel,
          channelTypes: [ChannelType.GuildText],
          required: true,
        },
        {
          name: "amount",
          description: "number of messages to be deleted (Max 99)",
          type: ApplicationCommandOptionType.Integer,
          required: false,
        },
      ],
    },
    {
      name: "bots",
      description: "purge all bot messages",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "channel",
          description: "channel from which messages must be cleaned",
          type: ApplicationCommandOptionType.Channel,
          channelTypes: [ChannelType.GuildText],
          required: true,
        },
        {
          name: "amount",
          description: "number of messages to be deleted (Max 99)",
          type: ApplicationCommandOptionType.Integer,
          required: false,
        },
      ],
    },
    {
      name: "links",
      description: "purge all messages with links",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "channel",
          description: "channel from which messages must be cleaned",
          type: ApplicationCommandOptionType.Channel,
          channelTypes: [ChannelType.GuildText],
          required: true,
        },
        {
          name: "amount",
          description: "number of messages to be deleted (Max 99)",
          type: ApplicationCommandOptionType.Integer,
          required: false,
        },
      ],
    },
    {
      name: "token",
      description: "purge all messages containing the specified token",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "channel",
          description: "channel from which messages must be cleaned",
          type: ApplicationCommandOptionType.Channel,
          channelTypes: [ChannelType.GuildText],
          required: true,
        },
        {
          name: "token",
          description: "token to be looked up in messages",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: "amount",
          description: "number of messages to be deleted (Max 99)",
          type: ApplicationCommandOptionType.Integer,
          required: false,
        },
      ],
    },
    {
      name: "user",
      description: "purge all messages from the specified user",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "channel",
          description: "channel from which messages must be cleaned",
          type: ApplicationCommandOptionType.Channel,
          channelTypes: [ChannelType.GuildText],
          required: true,
        },
        {
          name: "user",
          description: "user whose messages needs to be cleaned",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "amount",
          description: "number of messages to be deleted (Max 99)",
          type: ApplicationCommandOptionType.Integer,
          required: false,
        },
      ],
    },
  ],

  async run(client, interaction) {
    const { options, member } = interaction;

    const sub = options.getSubcommand();
    const channel = options.getChannel("channel");
    const amount = options.getInteger("amount") || 99;

    if (amount > 100)
      return interaction.followUp(
        "The max amount of messages that I can delete is 99"
      );

    let response;
    switch (sub) {
      case "all":
        response = await purgeMessages(member, channel, "ALL", amount);
        break;

      case "attachments":
        response = await purgeMessages(member, channel, "ATTACHMENT", amount);
        break;

      case "bots":
        response = await purgeMessages(member, channel, "BOT", amount);
        break;

      case "links":
        response = await purgeMessages(member, channel, "LINK", amount);
        break;

      case "token": {
        const token = interaction.options.getString("token");
        response = await purgeMessages(member, channel, "TOKEN", amount, token);
        break;
      }

      case "user": {
        const user = interaction.options.getUser("user");
        response = await purgeMessages(member, channel, "USER", amount, user);
        break;
      }

      default:
        return interaction.reply("Oops! Not a valid command selection");
    }

    // Success
    if (typeof response === "number") {
      return interaction.reply(
        `Successfully cleaned ${response} messages in ${channel}`
      );
    }

    // Member missing permissions
    else if (response === "MEMBER_PERM") {
      return interaction.reply(
        `You do not have permissions to Read Message History & Manage Messages in ${channel}`
      );
    }

    // Bot missing permissions
    else if (response === "BOT_PERM") {
      return interaction.reply(
        `I do not have permissions to Read Message History & Manage Messages in ${channel}`
      );
    }

    // No messages
    else if (response === "NO_MESSAGES") {
      return interaction.reply("Found no messages that can be cleaned");
    }

    // Remaining
    else {
      return interaction.reply("Failed to clean messages");
    }
  },
};
