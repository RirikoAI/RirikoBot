/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
import { replicateToken } from "helpers/getconfig";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageAttachment,
} = require("discord.js");
import Replicate from "replicate";
import language from "languages/en";
import { StableDiffusion } from "config";
import axios, { get } from "axios";
import { AttachmentBuilder } from "discord.js";

module.exports = {
  name: "imagine",
  description:
    "Imagine your dreams came true. Generate arts by giving it prompts",
  options: [
    {
      name: "prompt",
      description:
        "Enter your prompts to generate image with Stable Diffusion.",
      type: 3,
      required: true,
    },
  ],
  type: 1,
  run: imagineCommand,
};

async function imagineCommand(client, interaction, args, prefix) {
  await interaction.deferReply();
  const replicate = createReplicateClient();

  const userPrompt = interaction.options.getString("prompt");

  try {
    const output = await generateImage(replicate, userPrompt);

    const imageUrl = output.toString();

    const imageBuffer = await getImageBuffer(imageUrl);

    const attachment = createAttachment(imageBuffer);

    const embed = createEmbed(userPrompt, imageUrl, interaction.user);

    const embedRow = createActionRow(imageUrl);

    await interaction.editReply({
      embeds: [embed],
      components: [embedRow],
      files: [attachment],
    });
  } catch (e) {
    await handleErrorResponse(e, interaction);
  }
}

function createReplicateClient() {
  return new Replicate({
    auth: replicateToken(),
  });
}

async function generateImage(replicate, userPrompt) {
  const model = StableDiffusion.AvailableModels[StableDiffusion.Model];
  const input = {
    prompt: userPrompt,
    width: StableDiffusion.Width,
    height: StableDiffusion.Height,
    negative_prompt: StableDiffusion.NegativePrompt,
    disable_safety_check: StableDiffusion.DisableSafetyCheck,
    num_inference_steps: StableDiffusion.NumInferenceSteps,
    guidance_scale: StableDiffusion.GuidanceScale,
    scheduler: StableDiffusion.Scheduler,
  };

  return await replicate.run(model, { input });
}

async function getImageBuffer(imageUrl) {
  const response = await get(imageUrl, {
    responseType: "arraybuffer",
  });
  return response.data;
}

function createAttachment(imageBuffer) {
  return new AttachmentBuilder(imageBuffer, {
    name: "image.png",
  });
}

function createEmbed(userPrompt, imageUrl, user) {
  return new EmbedBuilder()
    .setImage("attachment://image.png")
    .setTitle("Here's your image")
    .setDescription(`**Prompts:**\n${userPrompt}`)
    .setColor("#00C853")
    .setFooter({
      text: `Requested by: ${user.username} | ${language.footer1}`,
      iconURL: user.displayAvatarURL({ dynamic: true }),
    });
}

function createActionRow(imageUrl) {
  return new ActionRowBuilder().addComponents(
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

async function handleErrorResponse(error, interaction) {
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
