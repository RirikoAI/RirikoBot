const {
  EmbedBuilder,
  InteractionType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const client = require("ririkoBot");
const config = require("config");
const {QuickDB} = require("quick.db");
const db = new QuickDB();

const mongodb = require("../app/Schemas/MusicBot");
const fs = require("fs");

module.exports = {
  name: "interactionCreate",
};

/**
 * on interactionCreate event
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 * @author TFAGaming https://github.com/TFAGaming/DiscordJS-V14-Bot-Template
 */
client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.slash_commands.get(interaction.commandName);
    
    if (!command) return;
    
    try {
      command.run(client, interaction, config, db);
    } catch (e) {
      console.error(e);
    }
  }
  
  if (interaction.isUserContextMenuCommand()) {
    // User:
    const command = client.user_commands.get(interaction.commandName);
    
    if (!command) return;
    
    try {
      command.run(client, interaction, config, db);
    } catch (e) {
      console.error(e);
    }
  }
  
  if (interaction.isMessageContextMenuCommand()) {
    // Message:
    const command = client.message_commands.get(interaction.commandName);
    
    if (!command) return;
    
    try {
      command.run(client, interaction, config, db);
    } catch (e) {
      console.error(e);
    }
  }
  
  if (interaction.isModalSubmit()) {
    // Modals:
    const modal = client.modals.get(interaction.customId);
    
    if (!modal)
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              "Something went wrong... Probably the Modal ID is not defined in the modals handler."
            )
            .setColor("Red"),
        ],
        ephemeral: true,
      });
    
    try {
      modal.run(client, interaction, config, db);
    } catch (e) {
      console.error(e);
    }
  }
  
  // !todo: Interaction tracking
  // if (!interaction.isButton()) return;
  //
  // // Handle the failed button interaction
  // await interaction.reply({
  //   content: 'The interaction is not recognized. It could be that the interaction is already expired. Rerun the command to try again.',
  //   ephemeral: true
  // });
});
