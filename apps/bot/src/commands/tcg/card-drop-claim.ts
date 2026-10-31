import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type Client,
  type MessageEditOptions,
  type User,
} from 'discord.js';
import { describeErrorForLog } from '@ririko/core';
import {
  formatCardEmbedFooter,
  getCardAttribution,
  RARITY_TIERS,
  type ActiveDrop,
  type CardRarity,
  type ClaimResult,
} from '@ririko/services';
import type { BotServices } from '../../services.js';
import { syncCollectionAchievements } from './achievement-progress.js';

/** Custom id prefix of the Claim button. The drop id follows. */
export const CARD_DROP_CLAIM_PREFIX = 'carddrop:claim:';

const CARD_IMAGE_NAME = 'card.png';

/** The expired edit waits this long past `expiresAt`, so no claim can succeed after it went out. */
const EXPIRY_GRACE_MS = 1000;

type CardDropFiles = Array<{ attachment: Buffer; name: string }>;

/** What the claim flow needs from the bot services. */
export type CardDropServices = Pick<
  BotServices,
  'dropManager' | 'achievementService' | 'waifuAssetRepo' | 'waifuCardRepo' | 'cardImageService'
>;

/** The result of a finished claim: the full card, and whether the DM with it arrived. */
export interface CompletedCardDropClaim {
  dmSent: boolean;
  embed: EmbedBuilder;
  files: CardDropFiles;
}

export function buildCardDropClaimRow(dropId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CARD_DROP_CLAIM_PREFIX}${dropId}`)
      .setLabel('Claim')
      .setEmoji('🃏')
      .setStyle(ButtonStyle.Primary),
  );
}

/** The drop message after a claim. The image and the button go; the DM holds the full card. */
function claimedDropEdit(drop: ActiveDrop): MessageEditOptions {
  const embed = new EmbedBuilder()
    .setTitle(`🎉 Claimed: ${drop.card.name}`)
    .setColor(0xff69b4)
    .setDescription(
      `<@${drop.claimedBy}> claimed **${drop.card.name}** (\`${drop.formattedSerial}\`).`,
    );
  return { embeds: [embed], components: [], attachments: [] };
}

/** The drop message when nobody claimed it in time. */
function expiredDropEdit(drop: ActiveDrop): MessageEditOptions {
  const embed = new EmbedBuilder()
    .setTitle(`⌛ Expired: ${drop.card.name}`)
    .setColor(0x808080)
    .setDescription(`Nobody claimed **${drop.card.name}** in time.`);
  return { embeds: [embed], components: [], attachments: [] };
}

/** Edits the posted drop message, if it has one. A failure is logged and never throws. */
async function editDropMessage(
  client: Client,
  drop: ActiveDrop,
  edit: MessageEditOptions,
): Promise<void> {
  if (!drop.messageId) return;
  try {
    const channel = await client.channels.fetch(drop.channelId);
    if (!channel?.isTextBased()) {
      console.warn(`[CardDrop] Channel ${drop.channelId} of drop ${drop.id} cannot be edited.`);
      return;
    }
    await channel.messages.edit(drop.messageId, edit);
  } catch (error) {
    console.warn(
      `[CardDrop] Could not edit the message of drop ${drop.id}: ${describeErrorForLog(error)}`,
    );
  }
}

/** Puts the drop message in the claimed state. */
export function showDropClaimed(client: Client, drop: ActiveDrop): Promise<void> {
  return editDropMessage(client, drop, claimedDropEdit(drop));
}

/**
 * Edits the drop message to the expired state after the claim window, unless the drop was claimed.
 * `claimDrop` rejects once `expiresAt` has passed, so a claim cannot succeed after this edit.
 */
export function scheduleCardDropExpiry(client: Client, drop: ActiveDrop): void {
  const delay = Math.max(0, drop.expiresAt - Date.now()) + EXPIRY_GRACE_MS;
  setTimeout(() => {
    if (drop.claimed) return;
    void editDropMessage(client, drop, expiredDropEdit(drop));
  }, delay).unref();
}

/**
 * Renders the full card PNG (art, frame, foil, stats) and points the embed at it.
 * Returns the `files` entry, or an empty list when rendering fails so the text embed still goes out.
 */
async function attachCardImage(
  services: CardDropServices,
  embed: EmbedBuilder,
  drop: ActiveDrop,
  attributionText: string,
): Promise<CardDropFiles> {
  try {
    const png = await services.cardImageService.getCardImage(drop.card, drop.asset, {
      attributionText,
      maxCollectionNumber: await services.waifuCardRepo.count(),
    });
    embed.setImage(`attachment://${CARD_IMAGE_NAME}`);
    return [{ attachment: png, name: CARD_IMAGE_NAME }];
  } catch (error) {
    console.warn(`[CardDrop] Failed to render card image for ${drop.card.id}:`, error);
    return [];
  }
}

/** The full card: its details, its attribution and, when it renders, its image. */
async function buildClaimedCard(
  userId: string,
  drop: ActiveDrop,
  services: CardDropServices,
): Promise<{ embed: EmbedBuilder; files: CardDropFiles }> {
  // The card is minted by now, so a failed lookup falls back to the default attribution.
  const source = await services.waifuAssetRepo
    .findSourceById(drop.asset.sourceId)
    .catch((error: unknown) => {
      console.warn(
        `[CardDrop] Could not load the source of ${drop.card.id}: ${describeErrorForLog(error)}`,
      );
      return null;
    });
  const { card } = drop;
  const tier = RARITY_TIERS[card.rarity as CardRarity] ?? RARITY_TIERS.COMMON;
  const embed = new EmbedBuilder()
    .setTitle(`🎉 Card Claimed: ${card.name}!`)
    .setColor(0xff69b4)
    .setDescription(
      `Congratulations <@${userId}>! You were the first to claim this card drop!\n\n` +
        `• **Rarity**: \`${tier.name}\` (${tier.foilEffect})\n` +
        `• **Element**: \`${card.element}\`\n` +
        `• **Serial**: \`${drop.formattedSerial}\`\n` +
        `• **Level**: \`1 / ${tier.maxLevel}\`\n` +
        `• **Stats**: HP \`${card.health}\` | ATK \`${card.attack}\` | DEF \`${card.defense}\` | SPD \`${card.speed}\``,
    )
    .setFooter(formatCardEmbedFooter(source, drop.formattedSerial));
  const files = await attachCardImage(services, embed, drop, getCardAttribution(source).footerText);
  return { embed, files };
}

/**
 * Finishes a successful claim, for the button and the commands alike: edits the drop message,
 * syncs the collection achievements and sends the full card by DM. Closed DMs do not lose the
 * claim; the caller shows the returned card instead.
 */
export async function completeCardDropClaim(
  user: User,
  drop: ActiveDrop,
  services: CardDropServices,
): Promise<CompletedCardDropClaim> {
  await showDropClaimed(user.client, drop);
  await syncCollectionAchievements(services, user.id);

  const { embed, files } = await buildClaimedCard(user.id, drop, services);
  let dmSent = true;
  try {
    await user.send({ embeds: [embed], files });
  } catch (error) {
    dmSent = false;
    console.warn(
      `[CardDrop] Could not DM the card of drop ${drop.id} to ${user.id}: ${describeErrorForLog(error)}`,
    );
  }
  return { dmSent, embed, files };
}

/** The private confirmation of a claim (button or slash). It carries the card when the DM failed. */
export function buildClaimConfirmation(
  drop: ActiveDrop,
  { dmSent, embed, files }: CompletedCardDropClaim,
): { content: string; embeds: EmbedBuilder[]; files: CardDropFiles } {
  return dmSent
    ? {
        content: `🎉 You claimed **${drop.card.name}**! The full card is in your DMs.`,
        embeds: [],
        files: [],
      }
    : {
        content: `🎉 You claimed **${drop.card.name}**! I could not DM you, so here is your card.`,
        embeds: [embed],
        files,
      };
}

/** The one-line reply to a prefix claim. A prefix reply cannot be private, so it never holds the card. */
export function buildPrefixClaimReply(drop: ActiveDrop, dmSent: boolean): string {
  return dmSent
    ? `🎉 You claimed **${drop.card.name}**! The full card is in your DMs.`
    : `🎉 You claimed **${drop.card.name}**! I could not DM you. See it with \`/cards\`.`;
}

/**
 * Handles a press of the Claim button. Every answer is private, and only a successful claim
 * changes the drop message for everyone.
 */
export async function handleCardDropClaimButton(
  interaction: ButtonInteraction,
  services: CardDropServices,
): Promise<void> {
  // Discord allows 3 seconds; the mint, the DM and the render can take longer.
  await interaction.deferUpdate();

  const dropId = interaction.customId.slice(CARD_DROP_CLAIM_PREFIX.length);
  const drop = services.dropManager.getActiveDropById(dropId);
  if (!drop) {
    // Drops live in memory, so a restart leaves dead buttons on old messages.
    try {
      await interaction.editReply({ components: [] });
    } catch (error) {
      console.warn(
        `[CardDrop] Could not remove the button of drop ${dropId}: ${describeErrorForLog(error)}`,
      );
    }
    await interaction.followUp({
      content: '⚠️ This card drop no longer exists.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let claim: ClaimResult;
  try {
    claim = await services.dropManager.claimDrop(drop.id, interaction.user.id);
  } catch (error) {
    console.error(`[CardDrop] Could not claim drop ${drop.id}: ${describeErrorForLog(error)}`);
    await interaction.followUp({
      content: '❌ Something went wrong while claiming this card. Please press **Claim** again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!claim.success) {
    await interaction.followUp({
      content: `⚠️ ${claim.error}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const completed = await completeCardDropClaim(interaction.user, drop, services);
  await interaction.followUp({
    ...buildClaimConfirmation(drop, completed),
    flags: MessageFlags.Ephemeral,
  });
}
