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
  resolveCardAssetDisplay,
  RARITY_TIERS,
  formatCardSerialNumber,
  type CardRarity,
} from '@ririko/services';

export function createCardCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'card',
      category: CommandCategory.TCG,
      description: 'Waifu TCG collection, inspection, claim, favorite, equip, and dismantling commands.',
      aliases: ['tcg', 'cards'],
      usage: '/card [action: collection|inspect|claim|favorite|equip|dismantle] [id] [filter] [sort]',
      examples: [
        '/card action:collection filter:ICE sort:level',
        '/card action:inspect id:12345678',
        '/card action:claim',
        '/card action:favorite id:12345678',
        '/card action:equip id:12345678',
        '/card action:dismantle id:12345678',
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
            { name: 'Loadout (View card 6-slot equipped gear & bonuses)', value: 'loadout' },
            { name: 'Equip Gear (Equip weapon/armor/relic/ring/amulet/talisman)', value: 'equip-gear' },
            { name: 'Unequip Gear (Unequip gear from slot)', value: 'unequip-gear' },
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
        if (['collection', 'inspect', 'claim', 'favorite', 'equip', 'dismantle', 'loadout', 'equip-gear', 'unequip-gear'].includes(firstArg ?? '')) {
          sub = firstArg;
        } else {
          sub = 'collection';
        }
      }

      switch (sub) {
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
          const footer = formatCardEmbedFooter(null, claimResult.formattedSerial);

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

          const rawUrl = claimResult.asset?.discordCdnUrl || claimResult.asset?.localStoragePath;
          if (rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('attachment://'))) {
            embed.setImage(rawUrl);
          }

          await ctx.reply({ embeds: [embed] });
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
              content: '❌ Card not found in your collection. Use `/card action:collection` to view your cards.',
              ephemeral: true,
            });
            return;
          }

          const baseCard = await services.waifuCardRepo.findById(userCard.cardId);
          if (!baseCard) {
            await ctx.reply({ content: '❌ Card definition missing.', ephemeral: true });
            return;
          }

          const asset = await services.waifuAssetRepo.findById(baseCard.assetId);
          const source = asset ? await services.waifuAssetRepo.findSourceById(asset.sourceId) : null;
          const display = asset ? resolveCardAssetDisplay(asset, source) : null;

          const tier = RARITY_TIERS[(baseCard.rarity as CardRarity) ?? 'COMMON'];
          const formattedSerial = formatCardSerialNumber(userCard.serialNumber);
          const footer = formatCardEmbedFooter(source, formattedSerial);

          const embed = new EmbedBuilder()
            .setTitle(`${userCard.isFavorite ? '⭐ ' : ''}${baseCard.name} (${formattedSerial})`)
            .setColor(baseCard.element === 'FIRE' ? 0xff4500 : baseCard.element === 'ICE' ? 0x00ffff : 0x9370db)
            .setDescription(
              `**Rarity**: \`${tier.name}\` • **Foil**: \`${tier.foilEffect}\`\n` +
                `**Element**: \`${baseCard.element}\` • **State**: \`${userCard.state}\`\n` +
                `**Level**: \`${userCard.level} / ${tier.maxLevel}\` (EXP: \`${userCard.exp}\`)\n\n` +
                `📊 **Attributes**\n` +
                `• **HP**: \`${baseCard.health}\`\n` +
                `• **ATK**: \`${baseCard.attack}\`\n` +
                `• **DEF**: \`${baseCard.defense}\`\n` +
                `• **SPD**: \`${baseCard.speed}\` (Turn Priority)\n` +
                `• **CRIT**: \`${(baseCard.critRate * 100).toFixed(1)}%\`\n` +
                `• **MP**: \`100 / 100\`\n\n` +
                `⚔️ **Active Tactical Skill**\n` +
                `**${baseCard.skillName ?? 'Skill'}**: ${baseCard.skillDescription ?? 'No description.'}\n\n` +
                `🛡️ **Passive Ability**\n` +
                `**${baseCard.passiveName ?? 'Passive'}**: ${baseCard.passiveDescription ?? 'No description.'}`,
            )
            .setFooter(footer);

          if (
            display?.imageUrl &&
            (display.imageUrl.startsWith('http://') ||
              display.imageUrl.startsWith('https://') ||
              display.imageUrl.startsWith('attachment://'))
          ) {
            embed.setImage(display.imageUrl);
          }

          await ctx.reply({ embeds: [embed] });
          break;
        }

        case 'collection': {
          const filter = ctx.options.getString('filter')?.toUpperCase();
          const sort = ctx.options.getString('sort') ?? 'rarity';

          const userCards = await services.waifuCardRepo.listUserCards(ctx.user.id, { limit: 100 });
          if (userCards.length === 0) {
            await ctx.reply({
              content: '📭 Your card album is currently empty! Watch out for automated card drops in chat to claim your first waifu!',
              ephemeral: true,
            });
            return;
          }

          // Fetch base cards for metadata
          const populated = await Promise.all(
            userCards.map(async (uc) => {
              const base = await services.waifuCardRepo.findById(uc.cardId);
              return { userCard: uc, base };
            }),
          );

          // Filter by element or rarity
          let filtered = populated.filter((item) => item.base !== null);
          if (filter) {
            filtered = filtered.filter(
              (item) => item.base?.element === filter || item.base?.rarity === filter,
            );
          }

          // Sort
          filtered.sort((a, b) => {
            if (sort === 'level') return b.userCard.level - a.userCard.level;
            if (sort === 'name') return (a.base?.name ?? '').localeCompare(b.base?.name ?? '');
            return (b.base?.attack ?? 0) - (a.base?.attack ?? 0);
          });

          const lines = filtered.slice(0, 15).map((item) => {
            const fav = item.userCard.isFavorite ? '⭐' : '•';
            const serial = formatCardSerialNumber(item.userCard.serialNumber);
            return `${fav} **${item.base?.name}** (\`${item.base?.rarity}\` | \`${item.base?.element}\`) — Lv.${item.userCard.level} [${serial}] (ID: \`${item.userCard.id.slice(0, 8)}\`)`;
          });

          const embed = new EmbedBuilder()
            .setTitle(`🎴 ${ctx.user.username}'s Waifu Collection`)
            .setColor(0xff69b4)
            .setDescription(
              `Showing **${Math.min(15, filtered.length)}** of **${filtered.length}** cards matching filters.\n\n` +
                (lines.length > 0 ? lines.join('\n') : '*No cards match the specified filter.*'),
            )
            .setFooter(formatCardEmbedFooter(null, `Total Owned: ${userCards.length}`));

          await ctx.reply({ embeds: [embed] });
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

        case 'loadout': {
          let cardId = ctx.options.getString('id') ?? rawArgs[1];
          if (!cardId) {
            // Find active equipped vanguard card
            const equippedCards = await services.waifuCardRepo.listUserCards(ctx.user.id, { state: 'EQUIPPED' });
            if (equippedCards.length > 0) {
              cardId = equippedCards[0]!.id;
            } else {
              const allCards = await services.waifuCardRepo.listUserCards(ctx.user.id);
              if (allCards.length > 0) {
                cardId = allCards[0]!.id;
              }
            }
          }

          if (!cardId) {
            await ctx.reply({ content: '❌ You do not have any cards to inspect loadouts for.', ephemeral: true });
            return;
          }

          const userCard = await services.waifuCardRepo.findUserCardById(cardId);
          if (!userCard || userCard.userId !== ctx.user.id) {
            await ctx.reply({ content: '❌ Card not found in your collection.', ephemeral: true });
            return;
          }

          const baseCard = await services.waifuCardRepo.findById(userCard.cardId);
          const loadout = await services.loadoutService.getCardLoadout(cardId);

          const renderSlot = (piece: typeof loadout.weapon, slotName: string) => {
            if (!piece) return `• **${slotName}**: *[Empty Slot]*`;
            const enhance = piece.inventoryItem.enhancementLevel > 0 ? ` **+${piece.inventoryItem.enhancementLevel}**` : '';
            return `• **${slotName}**: **${piece.item.name}**${enhance} (\`ID: ${piece.inventoryItem.id}\`)`;
          };

          const statsLines = Object.entries(loadout.aggregateStats).map(
            ([k, v]) => `  • **${k.toUpperCase()}**: +${v}`,
          );

          const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`⚔️ 6-Slot Combat Loadout: ${baseCard?.name ?? 'Card'} (Lv.${userCard.level})`)
            .setDescription(
              `**🛡️ Equipments**:\n` +
                `${renderSlot(loadout.weapon, 'Weapon')}\n` +
                `${renderSlot(loadout.armor, 'Armor')}\n` +
                `${renderSlot(loadout.relic, 'Relic')}\n\n` +
                `**💍 Accessories**:\n` +
                `${renderSlot(loadout.ring, 'Ring')}\n` +
                `${renderSlot(loadout.amulet, 'Amulet')}\n` +
                `${renderSlot(loadout.talisman, 'Talisman')}\n\n` +
                `📈 **Aggregate Gear Bonuses**:\n` +
                (statsLines.length > 0 ? statsLines.join('\n') : '  *No gear bonuses active.*') +
                (loadout.activePerks.length > 0
                  ? `\n\n🔥 **Active Battle Perks**:\n  • ${loadout.activePerks.join('\n  • ')}`
                  : ''),
            )
            .setFooter({
              text: 'Equip gear with /card action:equip-gear id:<card_id> item_id:<item_id> slot:<slot>',
            });

          await ctx.reply({ embeds: [embed] });
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
              content: `⚔️ Successfully equipped gear piece into the **${slot}** slot on **${baseCard?.name ?? 'Card'}**!${swapNotice}\nUse \`/card action:loadout id:${cardId}\` to view your updated loadout!`,
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
