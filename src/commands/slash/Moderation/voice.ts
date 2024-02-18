/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot/
 */
const deafen = require("commands/prefix/Moderation/shared/deafen");
const vmute = require("commands/prefix/Moderation/shared/vmute");
const vunmute = require("commands/prefix/Moderation/shared/vunmute");
const undeafen = require("commands/prefix/Moderation/shared/undeafen");
const disconnect = require("commands/prefix/Moderation/shared/disconnect");
const move = require("commands/prefix/Moderation/shared/move");
const { ApplicationCommandOptionType, ChannelType } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "voice",
  type: 1,
  description: "voice moderation commands",
  category: "MODERATION",
  permissions: ["MuteMembers", "MoveMembers", "DeafenMembers"],
  botPermissions: ["MuteMembers", "MoveMembers", "DeafenMembers"],
  command: {
    enabled: true,
  },
  options: [
    {
      name: "mute",
      description: "mute a member's voice",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "user",
          description: "the target member",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "reason",
          description: "reason for mute",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
    {
      name: "unmute",
      description: "unmute a muted member's voice",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "user",
          description: "the target member",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "reason",
          description: "reason for unmute",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
    {
      name: "deafen",
      description: "deafen a member in voice channel",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "user",
          description: "the target member",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "reason",
          description: "reason for deafen",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
    {
      name: "undeafen",
      description: "undeafen a member in voice channel",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "user",
          description: "the target member",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "reason",
          description: "reason for undeafen",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
    {
      name: "kick",
      description: "kick a member from voice channel",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "user",
          description: "the target member",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "reason",
          description: "reason for mute",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
    {
      name: "move",
      description: "move a member from one voice channel to another",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "user",
          description: "the target member",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "channel",
          description: "the channel to move member to",
          type: ApplicationCommandOptionType.Channel,
          channelTypes: [ChannelType.GuildVoice, ChannelType.GuildStageVoice],
          required: true,
        },
        {
          name: "reason",
          description: "reason for mute",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
  ],

  async run(interaction) {
    const sub = interaction.options.getSubcommand();
    const reason = interaction.options.getString("reason");

    const user = interaction.options.getUser("user");
    const target = await interaction.guild.members.fetch(user.id);

    let response;

    if (sub === "mute") response = await vmute(interaction, target, reason);
    else if (sub === "unmute")
      response = await vunmute(interaction, target, reason);
    else if (sub === "deafen")
      response = await deafen(interaction, target, reason);
    else if (sub === "undeafen")
      response = await undeafen(interaction, target, reason);
    else if (sub === "kick")
      response = await disconnect(interaction, target, reason);
    else if (sub == "move") {
      const channel = interaction.options.getChannel("channel");
      response = await move(interaction, target, reason, channel);
    }

    await interaction.followUp(response);
  },
};
