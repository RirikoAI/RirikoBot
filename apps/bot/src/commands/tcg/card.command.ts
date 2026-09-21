import {
  EmbedBuilder,
} from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';
import {
  formatCardEmbedFooter,
  getCardAttribution,
  RARITY_TIERS,
  formatCardSerialNumber,
  type CardRarity,
} from '@ririko/services';
import type { WaifuAsset, WaifuCard } from '@ririko/database';
import { buildTcgInfoEmbed, buildTcgInfoSelectMenu } from './info.command.js';
import { openGearMenu } from './gear-menu.js';
import {
  handleCardsCommand,
  buildCardInspectEmbed,
  buildCardInspectComponents,
} from './cards.command.js';

const CARD_IMAGE_NAME = 'card.png';

/**
 * Renders the full card PNG (art, frame, foil, stats) and points the embed at it.
 * Returns the reply `files` entry, or an empty list when rendering fails so the text embed
 * still goes out.
 */
async function attachCardImage(
  services: BotServices,
  embed: EmbedBuilder,
  card: WaifuCard,
  asset: WaifuAsset | null,
  attributionText: string,
): Promise<Array<{ attachment: Buffer; name: string }>> {
  try {
    const png = await services.cardImageService.getCardImage(card, asset, {
      attributionText,
      maxCollectionNumber: await services.waifuCardRepo.count(),
    });
    embed.setImage(`attachment://${CARD_IMAGE_NAME}`);
    return [{ attachment: png, name: CARD_IMAGE_NAME }];
  } catch (err) {
    console.warn(`[card] Failed to render card image for ${card.id}:`, err);
    return [];
  }
}

/**
 * Standalone `/loadout` (prefix `loadout`, `gear`, `equipment`): a shortcut for `/card action:gear`,
 * the interactive menu for equipping, comparing and enhancing a card's gear.
 */
export function createLoadoutCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'loadout',
      category: CommandCategory.TCG,
      description: "Open a card's gear menu: equip, compare, unequip & enhance its 6 gear slots.",
      aliases: ['gear', 'equipment'],
      usage: '/loadout [card_id]',
      examples: ['/loadout', '/loadout card_id:12345678'],
      options: [
        {
          name: 'card_id',
          description: 'Card to open (defaults to your active ⭐ card)',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const cardId = ctx.options.getString('card_id') ?? ctx.options.getRawArgs?.()[0];
      await openGearMenu(ctx, services, cardId);
    },
  };
}

export function createCardCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'card',
      category: CommandCategory.TCG,
      description: 'Waifu TCG collection, inspection, claim, favorite, equip, and dismantling commands.',
      aliases: ['tcg'],
      usage: '/card [action: collection|inspect|claim|favorite|equip|dismantle|gear|equip-gear|unequip-gear|guide] [id] [filter] [sort] [item_id] [slot]',
      examples: [
        '/card action:collection filter:ICE sort:level',
        '/card action:inspect id:12345678',
        '/card action:claim',
        '/card action:favorite id:12345678',
        '/card action:equip id:12345678',
        '/card action:dismantle id:12345678',
        '/card action:gear id:12345678',
        '/card action:equip-gear id:12345678 item_id:<item_id> slot:WEAPON',
        '/card action:unequip-gear item_id:<item_id>',
      ],
      options: [
        {
          name: 'action',
          description: 'Subcommand action to execute (collection, inspect, claim, favorite, equip, dismantle)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Collection (View your card collection album)', value: 'collection' },
            { name: 'Inspect (Inspect detailed card stats & foil art)', value: 'inspect' },
            { name: 'Claim (Claim active card drop in chat)', value: 'claim' },
            { name: 'Favorite (Lock card to protect from dismantle/sale)', value: 'favorite' },
            { name: 'Equip (Equip card to active combat loadout)', value: 'equip' },
            { name: 'Dismantle (Dismantle card for Crafting Dust)', value: 'dismantle' },
            { name: 'Gear (Interactive menu: equip, compare & enhance gear)', value: 'gear' },
            { name: 'Loadout (View card 6-slot equipped gear & bonuses)', value: 'loadout' },
            { name: 'Equip Gear (Equip weapon/armor/relic/ring/amulet/talisman)', value: 'equip-gear' },
            { name: 'Unequip Gear (Unequip gear from slot)', value: 'unequip-gear' },
            { name: 'Guide / Info (Tutorials, type advantages, rules)', value: 'guide' },
          ],
        },
        {
          name: 'id',
          description: 'Card ID or serial number to inspect, favorite, equip, or dismantle',
          type: 'STRING',
          required: false,
        },
        {
          name: 'filter',
          description: 'Filter collection by element (FIRE, ICE, etc.) or rarity',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Fire', value: 'FIRE' },
            { name: 'Ice', value: 'ICE' },
            { name: 'Earth', value: 'EARTH' },
            { name: 'Lightning', value: 'LIGHTNING' },
            { name: 'Water', value: 'WATER' },
            { name: 'Light', value: 'LIGHT' },
            { name: 'Shadow', value: 'SHADOW' },
            { name: 'Mythic', value: 'MYTHIC' },
            { name: 'Special Illustration Rare (SIR)', value: 'SIR' },
            { name: 'Secret Rare', value: 'SECRET_RARE' },
            { name: 'Ultra Rare', value: 'ULTRA_RARE' },
            { name: 'Super Rare', value: 'SUPER_RARE' },
            { name: 'Rare', value: 'RARE' },
          ],
        },
        {
          name: 'sort',
          description: 'Sort collection by level, rarity, or name',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Level (High to Low)', value: 'level' },
            { name: 'Rarity (High to Low)', value: 'rarity' },
            { name: 'Name (A to Z)', value: 'name' },
          ],
        },
        {
          name: 'drop_id',
          description: 'Specific drop ID to claim (optional)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'item_id',
          description: 'Inventory item ID to equip or unequip',
          type: 'STRING',
          required: false,
        },
        {
          name: 'slot',
          description: 'Target gear slot (WEAPON, ARMOR, RELIC, RING, AMULET, TALISMAN)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Weapon (ATK / CRIT / Battle Perk)', value: 'WEAPON' },
            { name: 'Armor (HP / DEF / Shield Perk)', value: 'ARMOR' },
            { name: 'Relic (Speed / Mastery / Tactical Perk)', value: 'RELIC' },
            { name: 'Ring (ATK% / CRIT% / Armor Piercing%)', value: 'RING' },
            { name: 'Amulet (HP% / DEF% / Resistance%)', value: 'AMULET' },
            { name: 'Talisman (SPD% / Max MP% / Mana Regen%)', value: 'TALISMAN' },
          ],
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const rawArgs = ctx.options.getRawArgs?.() ?? [];
      let sub = ctx.options.getString('action')?.toLowerCase();
      if (!sub) {
        try {
          const optionsRecord = ctx.options as unknown as Record<string, unknown>;
          const sc = typeof optionsRecord['getSubcommand'] === 'function'
            ? (optionsRecord['getSubcommand'] as () => string)()
            : null;
          if (sc) sub = String(sc).toLowerCase();
        } catch {
          // ignore
        }
      }
      if (!sub) {
        const firstArg = rawArgs[0]?.toLowerCase();
        if (['collection', 'inspect', 'claim', 'favorite', 'equip', 'dismantle', 'gear', 'loadout', 'equip-gear', 'unequip-gear', 'guide', 'info'].includes(firstArg ?? '')) {
          sub = firstArg;
        } else {
          sub = 'collection';
        }
      }

      switch (sub) {
        case 'guide':
        case 'info': {
          const embed = buildTcgInfoEmbed('overview');
          const row = buildTcgInfoSelectMenu('overview');
          await ctx.reply({
            embeds: [embed],
            components: [row],
          });
          break;
        }

        case 'claim': {
          const dropIdOption = ctx.options.getString('drop_id');
          const guildId = ctx.guild?.id ?? 'default_guild';
          const activeDrop = dropIdOption
            ? services.dropManager.getActiveDropById(dropIdOption)
            : services.dropManager.getActiveDrop(guildId);

          if (!activeDrop) {
            await ctx.reply({
              content: '❌ There is no active card drop in this channel or server right now!',
              ephemeral: true,
            });
            return;
          }

          const claimResult = await services.dropManager.claimDrop(activeDrop.id, ctx.user.id);
          if (!claimResult.success) {
            await ctx.reply({
              content: `⚠️ ${claimResult.error}`,
              ephemeral: true,
            });
            return;
          }

          const tier = RARITY_TIERS[(claimResult.card?.rarity as CardRarity) ?? 'COMMON'];
          const claimSource = claimResult.asset
            ? await services.waifuAssetRepo.findSourceById(claimResult.asset.sourceId)
            : null;
          const footer = formatCardEmbedFooter(claimSource, claimResult.formattedSerial);

          const embed = new EmbedBuilder()
            .setTitle(`🎉 Card Claimed: ${claimResult.card?.name}!`)
            .setColor(0xff69b4)
            .setDescription(
              `Congratulations <@${ctx.user.id}>! You were the first to claim this card drop!\n\n` +
                `• **Rarity**: \`${tier.name}\` (${tier.foilEffect})\n` +
                `• **Element**: \`${claimResult.card?.element}\`\n` +
                `• **Serial**: \`${claimResult.formattedSerial}\`\n` +
                `• **Level**: \`1 / ${tier.maxLevel}\`\n` +
                `• **Stats**: HP \`${claimResult.card?.health}\` | ATK \`${claimResult.card?.attack}\` | DEF \`${claimResult.card?.defense}\` | SPD \`${claimResult.card?.speed}\``,
            )
            .setFooter(footer);

          const files = claimResult.card
            ? await attachCardImage(
                services,
                embed,
                claimResult.card,
                claimResult.asset ?? null,
                getCardAttribution(claimSource).footerText,
              )
            : [];

          await ctx.reply({ embeds: [embed], files });
          break;
        }

        case 'inspect': {
          const cardId = ctx.options.getString('id');
          if (!cardId) {
            await ctx.reply({ content: '❌ Please specify a Card ID. Usage: `/card action:inspect id:<id>`', ephemeral: true });
            return;
          }

          const userCard = await services.waifuCardRepo.findUserCardById(cardId);

          if (!userCard || userCard.userId !== ctx.user.id) {
            await ctx.reply({
              content: '❌ Card not found in your collection. Use `/cards` to view your cards.',
              ephemeral: true,
            });
            return;
          }

          const baseCard = await services.waifuCardRepo.findById(userCard.cardId);
          if (!baseCard) {
            await ctx.reply({ content: '❌ Card definition missing.', ephemeral: true });
            return;
          }

          const asset = baseCard.assetId && services.waifuAssetRepo
            ? await services.waifuAssetRepo.findById(baseCard.assetId)
            : null;

          const { embed, files } = await buildCardInspectEmbed(services, {
            userCard,
            base: baseCard,
            asset,
          });
          const components = buildCardInspectComponents(userCard);

          await ctx.reply({ embeds: [embed], components, files });
          break;
        }

        case 'collection': {
          await handleCardsCommand(ctx, services);
          break;
        }

        case 'favorite': {
          const cardId = ctx.options.getString('id');
          if (!cardId) {
            await ctx.reply({ content: '❌ Please specify a Card ID. Usage: `/card action:favorite id:<id>`', ephemeral: true });
            return;
          }

          const userCard = await services.waifuCardRepo.findUserCardById(cardId);

          if (!userCard || userCard.userId !== ctx.user.id) {
            await ctx.reply({ content: '❌ Card not found in your collection.', ephemeral: true });
            return;
          }

          const newFav = !userCard.isFavorite;
          await services.waifuCardRepo.toggleUserCardFavorite(cardId, newFav);

          const base = await services.waifuCardRepo.findById(userCard.cardId);
          await ctx.reply({
            content: newFav
              ? `⭐ **${base?.name ?? 'Card'}** is now marked as favorite and protected from accidental dismantling or sale!`
              : `**${base?.name ?? 'Card'}** is no longer favorited.`,
          });
          break;
        }

        case 'equip': {
          const cardId = ctx.options.getString('id');
          if (!cardId) {
            await ctx.reply({ content: '❌ Please specify a Card ID. Usage: `/card action:equip id:<id>`', ephemeral: true });
            return;
          }

          const userCard = await services.waifuCardRepo.findUserCardById(cardId);

          if (!userCard || userCard.userId !== ctx.user.id) {
            await ctx.reply({ content: '❌ Card not found in your collection.', ephemeral: true });
            return;
          }

          if (userCard.state === 'IN_TRADE' || userCard.state === 'IN_MARKET') {
            await ctx.reply({
              content: `❌ Cannot equip card currently locked in state \`${userCard.state}\`.`,
              ephemeral: true,
            });
            return;
          }

          // Set existing equipped cards to IDLE first
          const equipped = await services.waifuCardRepo.listUserCards(ctx.user.id, { state: 'EQUIPPED' });
          for (const eqCard of equipped) {
            await services.waifuCardRepo.updateUserCardState(eqCard.id, 'IDLE');
          }

          await services.waifuCardRepo.updateUserCardState(cardId, 'EQUIPPED');
          const base = await services.waifuCardRepo.findById(userCard.cardId);

          await ctx.reply({
            content: `⚔️ **${base?.name ?? 'Card'}** (Lv.${userCard.level}) is now equipped as your active combat vanguard!`,
          });
          break;
        }

        case 'dismantle': {
          const cardId = ctx.options.getString('id');
          if (!cardId) {
            await ctx.reply({ content: '❌ Please specify a Card ID. Usage: `/card action:dismantle id:<id>`', ephemeral: true });
            return;
          }

          const result = await services.dismantleService.dismantleCard(ctx.user.id, cardId);

          if (!result.success) {
            await ctx.reply({ content: `❌ ${result.error}`, ephemeral: true });
            return;
          }

          await ctx.reply({
            content: `🔨 Dismantled **${result.cardName}** (\`${result.rarity}\`) into **${result.dustAwarded} Crafting Dust**!`,
          });
          break;
        }

        case 'gear':
        case 'loadout': {
          const cardId = ctx.options.getString('id') ?? rawArgs[1];
          await openGearMenu(ctx, services, cardId);
          break;
        }

        case 'equip-gear': {
          const cardId = ctx.options.getString('id') ?? rawArgs[1];
          const itemId = ctx.options.getString('item_id') ?? rawArgs[2];
          const slot = (ctx.options.getString('slot') ?? rawArgs[3])?.toUpperCase();

          if (!cardId || !itemId || !slot) {
            await ctx.reply({
              content:
                '❌ Missing arguments! Usage: `/card action:equip-gear id:<card_id> item_id:<item_id> slot:<WEAPON|ARMOR|RELIC|RING|AMULET|TALISMAN>`',
              ephemeral: true,
            });
            return;
          }

          try {
            const { loadout, unequippedItemName } = await services.loadoutService.equip(
              ctx.user.id,
              cardId,
              itemId,
              slot as import('@ririko/services').GearSlot,
            );

            const userCard = await services.waifuCardRepo.findUserCardById(cardId);
            const baseCard = await services.waifuCardRepo.findById(userCard?.cardId ?? '');

            const swapNotice = unequippedItemName
              ? ` (Swapped out **${unequippedItemName}** to inventory)`
              : '';

            await ctx.reply({
              content: `⚔️ Successfully equipped gear piece into the **${slot}** slot on **${baseCard?.name ?? 'Card'}**!${swapNotice}\nUse \`/card action:gear\` to manage your gear!`,
            });
          } catch (err: unknown) {
            await ctx.reply({
              content: `❌ **Equip Failed**: ${err instanceof Error ? err.message : String(err)}`,
              ephemeral: true,
            });
          }
          break;
        }

        case 'unequip-gear': {
          const itemId = ctx.options.getString('item_id') ?? rawArgs[1];
          if (!itemId) {
            await ctx.reply({
              content: '❌ Please specify the inventory item ID to unequip. Usage: `/card action:unequip-gear item_id:<item_id>`',
              ephemeral: true,
            });
            return;
          }

          try {
            const { unequippedItemName } = await services.loadoutService.unequip(ctx.user.id, itemId);
            await ctx.reply({
              content: `🛡️ Unequipped **${unequippedItemName}**! The gear piece was safely returned to your inventory.`,
            });
          } catch (err: unknown) {
            await ctx.reply({
              content: `❌ **Unequip Failed**: ${err instanceof Error ? err.message : String(err)}`,
              ephemeral: true,
            });
          }
          break;
        }

        default:
          await ctx.reply({ content: `Unknown subcommand: ${sub}`, ephemeral: true });
      }
    },
  };
}
