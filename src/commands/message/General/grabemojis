const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  name: "Grab Emojis",
  type: 3,
  run: async (client, interaction, config, db) => {
    const messageContent = interaction.options.getMessage('message').content;
    const emojiRegex = /<(a?):(\w+):(\d+)>/g;
    let match;
    const emojis = [];
    const uniqueId = Date.now(); 

    while ((match = emojiRegex.exec(messageContent)) !== null) {
      emojis.push({
        animated: match[1] === 'a',
        name: match[2],
        id: match[3]
      });
    }

    if (emojis.length === 0) {
      return interaction.reply({
        content: "🚫 No custom emojis found in the message.",
        ephemeral: true,
      });
    }

    const createEmbedWithEmoji = (emoji, index, total) => {
      const emojiUrl = `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`;
      return new EmbedBuilder()
        .setTitle(`Emoji ${index + 1} of ${total}`) 
        .addFields([
          { name: "Name", value: `\`${emoji.name}\``, inline: true },
          { name: "ID", value: `\`${emoji.id}\``, inline: true }
        ])
        .setColor("Purple")
        .setImage(emojiUrl)
        .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });
    };

    let currentEmojiIndex = 0;
    let embeds = [createEmbedWithEmoji(emojis[currentEmojiIndex], currentEmojiIndex, emojis.length)];

    const components = [];
    if (emojis.length > 1) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`previous_emoji_${uniqueId}`)
          .setLabel("<")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`next_emoji_${uniqueId}`)
          .setLabel(">")
          .setStyle(ButtonStyle.Primary),
      ));
    }

    await interaction.reply({
      embeds: embeds,
      components: components,
      ephemeral: true,
    });

    const filter = (i) => i.user.id === interaction.user.id && i.customId.includes(uniqueId.toString());
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async (i) => {
      if (i.customId.includes("previous_emoji")) {
        currentEmojiIndex = (currentEmojiIndex - 1 + emojis.length) % emojis.length;
      } else if (i.customId.includes("next_emoji")) {
        currentEmojiIndex = (currentEmojiIndex + 1) % emojis.length;
      }

      embeds = [createEmbedWithEmoji(emojis[currentEmojiIndex], currentEmojiIndex, emojis.length)];

      try {
        await i.update({ embeds: embeds, components: components });
      } catch (error) {
        const errorEmbed = new EmbedBuilder()
          .setTitle("Error")
          .setDescription("An error occurred while updating the emoji.")
          .setColor("Red")
          .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });

        const disabledComponents = components.map(component =>
          new ActionRowBuilder()
            .addComponents(component.components.map(btn =>
              ButtonBuilder.from(btn).setDisabled(true)
            ))
        );
    
        await i.update({ embeds: [errorEmbed], components: disabledComponents }).catch(console.error);
      }
    });
  },
};
