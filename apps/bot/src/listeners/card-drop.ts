import { EmbedBuilder, type Message } from 'discord.js';
import { getCardAttribution, RARITY_TIERS, type CardRarity } from '@ririko/services';
import {
  buildCardDropClaimRow,
  scheduleCardDropExpiry,
  showDropClaimed,
} from '../commands/tcg/card-drop-claim.js';
import type { BotServices } from '../services.js';

const DROP_IMAGE_NAME = 'card-drop.png';

/**
 * Counts a chat message toward the guild's Waifu TCG card drop and, when it reaches the
 * threshold, posts the drop in the channel with a Claim button. `/card action:claim` also claims it.
 * Never throws: a failed drop must not stop XP and rewards for the message.
 */
export async function handleCardDrop(message: Message, services: BotServices): Promise<void> {
  const guild = message.guild;
  if (!guild || !services.dropManager) return;
  try {
    const drop = await services.dropManager.recordMessage(
      guild.id,
      message.channelId,
      message.author.id,
    );
    if (!drop || !message.channel.isSendable()) return;

    const tier = RARITY_TIERS[drop.card.rarity as CardRarity] ?? RARITY_TIERS.COMMON;
    const source = await services.waifuAssetRepo.findSourceById(drop.asset.sourceId);
    const expiresAt = Math.floor(drop.expiresAt / 1000);
    const embed = new EmbedBuilder()
      .setTitle(`🃏 A card dropped: ${drop.card.name}!`)
      .setColor(0xff69b4)
      .setDescription(
        `• **Rarity**: \`${tier.name}\`\n` +
          `• **Element**: \`${drop.card.element}\`\n` +
          `• **Serial**: \`${drop.formattedSerial}\`\n\n` +
          `Press **Claim** to keep it. First come, first served. Expires <t:${expiresAt}:R>.`,
      )
      .setFooter({ text: getCardAttribution(source).footerText });

    const files: Array<{ attachment: Buffer; name: string }> = [];
    try {
      const png = await services.cardImageService.getCardImage(drop.card, drop.asset, {
        attributionText: getCardAttribution(source).footerText,
        maxCollectionNumber: await services.waifuCardRepo.count(),
      });
      embed.setImage(`attachment://${DROP_IMAGE_NAME}`);
      files.push({ attachment: png, name: DROP_IMAGE_NAME });
    } catch (error) {
      console.warn(`[CardDrop] Failed to render card image for ${drop.card.id}:`, error);
    }

    const sent = await message.channel.send({
      embeds: [embed],
      files,
      components: [buildCardDropClaimRow(drop.id)],
    });
    services.dropManager.setDropMessage(drop.id, sent.id);
    scheduleCardDropExpiry(message.client, drop);
    // A command claim may have won while the image rendered, before the message id was known.
    if (drop.claimed) await showDropClaimed(message.client, drop);
  } catch (error) {
    console.error(`[CardDrop] Card drop failed in guild ${guild.id}:`, error);
  }
}
