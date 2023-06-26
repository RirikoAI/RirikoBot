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
import axios from "axios";
import { AttachmentBuilder } from "discord.js";

let replicate = null;

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
  run: async (client, interaction, args, prefix, config, db) => {
    await interaction.deferReply();
    // create replicate client
    const replicate = new Replicate({
      // get your token from https://replicate.com/account
      auth: replicateToken(),
    });

    const userPrompt = interaction.options.getString("prompt");

    try {
      const model = StableDiffusion.AvailableModels[StableDiffusion.Model];
      const input = {
        prompt: userPrompt,
        width: StableDiffusion.Width,
        height: StableDiffusion.Height,
        negative_prompt: StableDiffusion.NegativePrompt,
        disable_safety_check: true,
        num_inference_steps: StableDiffusion.NumInferenceSteps,
        guidance_scale: StableDiffusion.GuidanceScale,
        scheduler: StableDiffusion.Scheduler,
      };

      const output = await replicate.run(model, { input });

      const imageUrl = output.toString();

      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
      });
      const imageBuffer = response.data;

      const attachment = new AttachmentBuilder(imageBuffer, {
        name: "image.png",
      });

      const embed = new EmbedBuilder()
        .setImage("attachment://image.png")
        .setTitle("Here's your image")
        .setDescription(`**Prompts:**\n${userPrompt}`)
        .setColor("#00C853")
        .setFooter({
          text: `Requested by: ${interaction.user.username} | ${language.footer1}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
        });

      const embedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setURL(imageUrl)
          .setLabel(`Download Image`)
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setURL("https://angel.net.my/prompts.php")
          .setLabel("Example Prompts")
          .setStyle(ButtonStyle.Link)
      );

      await interaction.editReply({
        embeds: [embed],
        components: [embedRow],
        files: [attachment],
      });
    } catch (e) {
      console.error(
        "An error occured when trying to generate image with Stable Diffusion.",
        e
      );
      if (e.message.includes("NSFW")) {
        await interaction.editReply(
          "NSFW content detected. Please retry or change your prompt."
        );
      } else if (e.message.includes("ExperimentalWarning")) {
        // k
      } else {
        await interaction.editReply(
          "Something went wrong. Please check your console for errors."
        );
      }
    }
  },
};
