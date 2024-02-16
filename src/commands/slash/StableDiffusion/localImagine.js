/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
import sdwebui, { SamplingMethod } from "node-sd-webui";
import { writeFileSync } from "fs";
import {
  createActionRow,
  createAttachment,
  createEmbed,
  getImageBuffer,
  handleErrorResponse,
} from "./shared";
import { AttachmentBuilder } from "discord.js";

module.exports = {
  name: "limagine",
  description:
    "(Local Stable Diffusion) Imagine your dreams came true. Generate arts by giving it prompts",
  options: [
    {
      name: "prompt",
      description:
        "Enter your prompts to generate image with your local Stable Diffusion.",
      type: 3,
      required: true,
    },
  ],
  type: 1,
  run: localImagineCommand,
};

async function localImagineCommand(client, interaction, args, prefix) {
  const liclient = sdwebui();

  await interaction.deferReply();

  const userPrompt = interaction.options.getString("prompt");
  try {
    const { images } = await liclient.txt2img({
      prompt: userPrompt,
      negativePrompt: "",
      samplingMethod: SamplingMethod.Euler_A,
      width: 512,
      height: 512,
      steps: 10,
      batchSize: 1,
    });

    for (const image of images) {
      const i = images.indexOf(image);
      const filename = Math.random().toString(36).slice(2);
      writeFileSync(`temp/image-${filename}.png`, images[i], "base64");

      const attachment = new AttachmentBuilder(
        `temp/image-${filename}.png`
      ).setName("image.png");

      const embed = createEmbed(userPrompt, "", interaction.user);

      await interaction.editReply({
        embeds: [embed],
        // components: [embedRow],
        files: [attachment],
      });
    }
  } catch (err) {
    console.error(err);
    await handleErrorResponse(err, interaction);
  }
}
