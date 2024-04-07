import get from "axios";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { language } from "languages/en";

export async function getImageBuffer(imageUrl) {
  const response = await get(imageUrl, {
    responseType: "arraybuffer",
  });
  return response.data;
}

export function createAttachment(imageBuffer) {
  return new AttachmentBuilder(imageBuffer, {
    name: "image.png",
  });
}

export function createEmbed(userPrompt, imageUrl, user) {
  return new EmbedBuilder()
    .setImage("attachment://image.png")
    .setTitle("Here's your image")
    .setDescription(`**Prompts:**\n/imagine prompt:${userPrompt}`)
    .setColor("#00C853")
    .setFooter({
      text: `Requested by: ${user.username} | ${language.footer1}`,
      iconURL: user.displayAvatarURL({ dynamic: true }),
    });
}

export function createActionRow(imageUrl) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('run_command_again')
      .setLabel('Run Command Again')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setURL(imageUrl)
      .setLabel(`Download Image`)
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setURL("https://angel.net.my/prompts.php")
      .setLabel("Example Prompts")
      .setStyle(ButtonStyle.Link)
  );
}

export async function handleErrorResponse(error, interaction) {
  console.error(
    "An error occurred when trying to generate image with Stable Diffusion.",
    error
  );
  if (error.message.includes("NSFW")) {
    await interaction.editReply(
      "NSFW content detected. Please retry or change your prompt."
    );
  } else if (error.message.includes("ExperimentalWarning")) {
    // Ignore experimental warnings
  } else {
    await interaction.editReply(
      "Something went wrong. Please check your console for errors."
    );
  }
}
