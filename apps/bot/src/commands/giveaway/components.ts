import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonStyle,
  type ButtonInteraction,
  type GuildMember,
} from 'discord.js';
import type { BotServices } from '../../services.js';
import type { GiveawayRequirements } from '@ririko/services';

export async function handleGiveawayButtonInteraction(
  interaction: ButtonInteraction,
  services: BotServices,
): Promise<void> {
  const giveawayId = interaction.customId.replace('giveaway:enter:', '').trim();
  if (!giveawayId) return;

  const giveaway = await services.giveawayRepo.findById(giveawayId);
  if (!giveaway || giveaway.isEnded) {
    await interaction.reply({
      content: '❌ This giveaway has ended or is no longer available.',
      ephemeral: true,
    });
    return;
  }

  const alreadyEntered = await services.giveawayRepo.hasUserEntered(
    giveawayId,
    interaction.user.id,
  );
  if (alreadyEntered) {
    await interaction.reply({
      content: '⚠️ You have already entered this giveaway!',
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member as GuildMember | null;
  let roleIds: string[] = [];
  if (member?.roles) {
    if (Array.isArray(member.roles)) {
      roleIds = member.roles;
    } else if (member.roles.cache) {
      if (typeof (member.roles.cache as any).map === 'function') {
        roleIds = (member.roles.cache as any).map((r: any) => (typeof r === 'string' ? r : r.id));
      } else {
        roleIds = Array.from(member.roles.cache.values()).map((r: any) =>
          typeof r === 'string' ? r : r.id,
        );
      }
    }
  }
  const validation = services.giveawayEngine.validateEntry(
    {
      createdTimestamp: interaction.user.createdTimestamp,
      joinedTimestamp: member?.joinedTimestamp ?? null,
      roleIds,
      isBooster: Boolean(member?.premiumSince),
    },
    giveaway.requirements as GiveawayRequirements | undefined,
  );

  if (!validation.allowed) {
    await interaction.reply({
      content: `❌ You cannot enter this giveaway: ${validation.reason ?? 'Requirements not met.'}`,
      ephemeral: true,
    });
    return;
  }

  const bonusMultiplier = validation.bonusMultiplier ?? 1;
  const added = await services.giveawayRepo.addEntry(
    giveawayId,
    interaction.user.id,
    bonusMultiplier,
  );
  if (!added) {
    await interaction.reply({
      content: '⚠️ You have already entered this giveaway!',
      ephemeral: true,
    });
    return;
  }

  const totalEntries = await services.giveawayRepo.getEntryCount(giveawayId);

  // Update button and embed count on message
  try {
    const embedData = services.giveawayEngine.formatGiveawayEmbed(giveaway, totalEntries);
    const buttonData = services.giveawayEngine.formatGiveawayButton(
      giveawayId,
      false,
      totalEntries,
    );

    const embed = new EmbedBuilder(embedData);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buttonData.customId)
        .setLabel(buttonData.label)
        .setStyle(buttonData.style as ButtonStyle)
        .setEmoji(buttonData.emoji),
    );

    await interaction.message.edit({
      embeds: [embed],
      components: [row],
    });
  } catch (err) {
    console.error(`[GiveawayButton] Failed to update message for giveaway ${giveawayId}:`, err);
  }

  const bonusText = bonusMultiplier > 1 ? ` (Bonus entries: **${bonusMultiplier}x**)` : '';
  await interaction.reply({
    content: `🎉 You have successfully entered the giveaway for **${giveaway.prize}**!${bonusText}`,
    ephemeral: true,
  });
}
