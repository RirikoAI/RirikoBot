/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
import { replicateToken } from "helpers/getconfig";

import Replicate from "replicate";
// @ts-ignore
import { StableDiffusion } from "../../../../config/config";
import { getAndIncrementUsageCount } from "helpers/commandUsage";
import {
  createActionRow,
  createAttachment,
  createEmbed,
  getImageBuffer,
  handleErrorResponse,
} from "./shared";

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

async function imagineCommand(client, interaction, args, prefix, manualUserPrompt = false) {
  if (StableDiffusion.DailyLimit !== false)
    try {
      const usageCount = await getAndIncrementUsageCount(
        interaction.member.user.id,
        StableDiffusion.DailyLimit,
        "imagine"
      );
    } catch (e) {
      return await interaction.reply(e.message);
    }
  
  try {
    await interaction.deferReply();
    
    const replicate = createReplicateClient();
    
    const userPrompt = (manualUserPrompt ? manualUserPrompt : interaction.options.getString("prompt"));
    
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
    
    const filter = (i) => i.customId === 'run_command_again' && i.user.id === interaction.user.id;
    
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000 });
    
    collector.on('collect', async (i) => {
      await imagineCommand(client, i, args, prefix, userPrompt); // Execute your command again
    });
  } catch (e) {
    if (e.message.includes('already been acknowledged')) return;
    if (e.message.includes('has not been sent or deferred')) return;
    if (e.message.includes('Unknown interaction')) return;
    await handleErrorResponse(e, interaction);
  }
}

function createReplicateClient() {
  return new Replicate({
    auth: replicateToken(),
  });
}

export async function generateImage(replicate, userPrompt) {
  const model = StableDiffusion.AvailableModels[StableDiffusion.Model];
  const input = {
    prompt: userPrompt,
    width: StableDiffusion.Width,
    height: StableDiffusion.Height,
    negative_prompt: StableDiffusion.NegativePrompt,
    disable_safety_checker: StableDiffusion.DisableSafetyCheck,
    num_inference_steps: StableDiffusion.NumInferenceSteps,
    guidance_scale: StableDiffusion.GuidanceScale,
    scheduler: StableDiffusion.Scheduler,
  };

  return await replicate.run(model, { input });
}
