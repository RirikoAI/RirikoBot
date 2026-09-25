import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type Message,
} from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { enhanceGear } from './gear-actions.js';
import { openCraftMenu } from './craft-menu.js';
import { ALL_GEAR_SLOTS } from '@ririko/services';
import type { RecipeStatus } from '@ririko/services';

export function createItemCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'item',
      category: CommandCategory.TCG,
      description: 'Manage, inspect, enhance, and consume TCG equipment, accessories, and potions.',
      aliases: ['tcgitem', 'items'],
      usage:
        '/item [action: inventory|enhance|use|craft] [id] [filter] [card_id] [recipe] [quantity]',
      examples: [
        '/item action:inventory filter:EQUIPMENT',
        '/item action:enhance id:12345678',
        '/item action:use id:12345678',
        '/item action:craft',
        '/item action:craft recipe:CRAFT_WEAPON_OBSIDIAN_KATANA',
        '/item action:craft recipe:CRAFT_POTION_MAJOR_HP quantity:3',
      ],
      options: [
        {
          name: 'action',
          description: 'Subcommand action to execute (inventory, enhance, use, craft)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Inventory (View owned equipment, accessories & potions)', value: 'inventory' },
            { name: 'Enhance (Upgrade equipment from +0 to +10)', value: 'enhance' },
            { name: 'Use (Consume an HP, Mana, or Energy potion)', value: 'use' },
            { name: 'Craft (Forge gear & potions from Crafting Dust)', value: 'craft' },
          ],
        },
        {
          name: 'id',
          description: 'Inventory item ID to enhance or consume',
          type: 'STRING',
          required: false,
        },
        {
          name: 'filter',
          description: 'Filter inventory by item type or gear slot',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'All Equipments (Weapons, Armor, Relics)', value: 'EQUIPMENT' },
            { name: 'All Accessories (Rings, Amulets, Talismans)', value: 'ACCESSORY' },
            { name: 'All Consumables (Potions, Energy Restores)', value: 'CONSUMABLE' },
          ],
        },
        {
          name: 'card_id',
          description: 'Target card ID when consuming HP or Mana potions (optional)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'recipe',
          description: 'Crafting recipe code to craft directly (omit to open the crafting menu)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'quantity',
          description: 'How many to craft (equipment/accessories are capped at 1, potions at 10)',
          type: 'INTEGER',
          required: false,
          minValue: 1,
          maxValue: 10,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const rawArgs = ctx.options.getRawArgs?.() ?? [];
      let sub = ctx.options.getString('action')?.toLowerCase();

      if (!sub) {
        try {
          const optionsRecord = ctx.options as unknown as Record<string, unknown>;
          if (typeof optionsRecord['getSubcommand'] === 'function') {
            sub = (optionsRecord['getSubcommand'] as () => string)();
          }
        } catch {
          // not slash subcommand
        }
      }

      if (!sub && rawArgs.length > 0) {
        const firstArg = rawArgs[0]!.toLowerCase();
        if (
          ['inventory', 'inv', 'enhance', 'upgrade', 'use', 'consume', 'craft', 'forge'].includes(
            firstArg,
          )
        ) {
          sub = firstArg;
        }
      }

      if (sub === 'inv') sub = 'inventory';
      if (sub === 'upgrade') sub = 'enhance';
      if (sub === 'consume') sub = 'use';
      if (sub === 'forge') sub = 'craft';

      switch (sub) {
        case 'enhance':
          await handleEnhance(ctx, services, rawArgs);
          break;
        case 'use':
          await handleUse(ctx, services, rawArgs);
          break;
        case 'craft':
          await handleCraft(ctx, services, rawArgs);
          break;
        case 'inventory':
        default:
          await handleInventory(ctx, services, rawArgs);
          break;
      }
    },
  };
}

async function handleInventory(
  ctx: CommandContext,
  services: BotServices,
  rawArgs: readonly string[],
): Promise<void> {
  const userId = ctx.user.id;
  let activeFilter: 'ALL' | 'GEAR' | 'POTIONS' = 'ALL';

  const rawFilter =
    ctx.options.getString('filter')?.toUpperCase() ?? rawArgs[1]?.toUpperCase() ?? '';
  if (rawFilter === 'EQUIPMENT' || rawFilter === 'ACCESSORY' || rawFilter === 'GEAR') {
    activeFilter = 'GEAR';
  } else if (rawFilter === 'CONSUMABLE' || rawFilter === 'POTIONS' || rawFilter === 'POTION') {
    activeFilter = 'POTIONS';
  }

  let selectedIndex = 0;

  const loadItems = async () => {
    const inventoryItems = await services.userInventoryItemRepo.findByUser(userId);
    const detailed = await Promise.all(
      inventoryItems.map(async (inv) => {
        const def = await services.gameItemRepo.findById(inv.itemId);
        return { inv, def };
      }),
    );

    return detailed.filter(
      (entry): entry is { inv: typeof entry.inv; def: NonNullable<typeof entry.def> } => {
        if (!entry.def) return false;
        if (activeFilter === 'GEAR') {
          return entry.def.type === 'EQUIPMENT' || entry.def.type === 'ACCESSORY';
        }
        if (activeFilter === 'POTIONS') {
          return entry.def.type === 'CONSUMABLE';
        }
        return true;
      },
    );
  };

  let items = await loadItems();

  if (items.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎒 Summoner Gear & Item Inventory')
      .setDescription(
        'Your inventory is currently empty.\nVisit the Town Shop (`/game shop` or `/shop`) or explore dungeons to acquire gear and consumables!',
      );
    await ctx.reply({ embeds: [embed] });
    return;
  }

  const buildInvEmbed = (itemsList: typeof items, itemIdx: number, actionNotice?: string) => {
    const selected = itemsList[itemIdx];

    const lines = itemsList.slice(0, 15).map(({ inv, def }, idx) => {
      const isCurrent = idx === itemIdx;
      const marker = isCurrent ? '👉 ' : '• ';
      const enhancementTag = inv.enhancementLevel > 0 ? ` **+${inv.enhancementLevel}**` : '';
      const stateTag = inv.state === 'EQUIPPED' ? ` \`[EQUIPPED: ${inv.slot}]\`` : '';
      const qtyTag =
        def.type === 'CONSUMABLE' || def.type === 'MATERIAL' ? ` (x${inv.quantity})` : '';
      const perkText =
        def.battlePerks && def.battlePerks.length > 0
          ? ` | *Perk: ${def.battlePerks.join(', ')}*`
          : '';
      return `${marker}**${def.name}**${enhancementTag}${qtyTag}${stateTag} — [${def.rarity}]\n  *${def.description}*${perkText}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🎒 ${ctx.user.username}'s Gear & Consumables (${itemsList.length} items)`)
      .setDescription(
        (actionNotice ? `${actionNotice}\n\n` : '') +
          lines.join('\n\n') +
          (selected
            ? `\n\n🎯 **Selected Item**: **${selected.def.name}** [${selected.def.rarity} ${selected.def.subtype}]` +
              (selected.def.type === 'CONSUMABLE' || selected.def.type === 'MATERIAL'
                ? ` (Quantity: ${selected.inv.quantity})`
                : ` (Enhancement: +${selected.inv.enhancementLevel})`) +
              `\n*${selected.def.description}*`
            : ''),
      )
      .setFooter({
        text: 'Select an item to use or enhance | Filter categories with buttons below',
      });

    return embed;
  };

  const buildInvComponents = (itemsList: typeof items, itemIdx: number) => {
    const selected = itemsList[itemIdx];

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('inv:select_item')
      .setPlaceholder(selected ? `Selected: ${selected.def.name}` : 'Select an item to inspect...');

    for (let i = 0; i < Math.min(25, itemsList.length); i++) {
      const { inv, def } = itemsList[i]!;
      const isConsumable = def.type === 'CONSUMABLE';
      const icon =
        def.subtype === 'HP_POTION'
          ? '🧪'
          : def.subtype === 'MANA_POTION'
            ? '🔷'
            : isConsumable
              ? '⚡'
              : '⚔️';
      const detailTag = isConsumable
        ? `(x${inv.quantity})`
        : inv.enhancementLevel > 0
          ? `(+${inv.enhancementLevel})`
          : '';

      selectMenu.addOptions({
        label: `${icon} ${def.name} ${detailTag}`.trim(),
        description: def.description ? def.description.slice(0, 100) : `${def.type} item`,
        value: String(i),
        default: i === itemIdx,
      });
    }

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>();

    if (selected && selected.def.type === 'CONSUMABLE') {
      buttonRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`inv:action:use:${selected.inv.id}`)
          .setLabel(`🧪 Use ${selected.def.name}`)
          .setStyle(ButtonStyle.Success),
      );
    } else if (
      selected &&
      (selected.def.type === 'EQUIPMENT' || selected.def.type === 'ACCESSORY')
    ) {
      buttonRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`inv:action:enhance:${selected.inv.id}`)
          .setLabel(`⚡ Enhance +1`)
          .setStyle(ButtonStyle.Primary),
      );
    }

    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId('inv:filter:ALL')
        .setLabel('📦 All')
        .setStyle(activeFilter === 'ALL' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('inv:filter:GEAR')
        .setLabel('⚔️ Gear')
        .setStyle(activeFilter === 'GEAR' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('inv:filter:POTIONS')
        .setLabel('🧪 Potions')
        .setStyle(activeFilter === 'POTIONS' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );

    return [selectRow, buttonRow];
  };

  const initialEmbed = buildInvEmbed(items, selectedIndex);
  const initialComponents = buildInvComponents(items, selectedIndex);

  const replyMsg = await ctx.reply({ embeds: [initialEmbed], components: initialComponents });
  const discordMsg = (
    replyMsg && typeof replyMsg === 'object' && 'fetch' in replyMsg
      ? await (replyMsg as any).fetch()
      : replyMsg
  ) as Message | undefined;

  if (
    !discordMsg ||
    typeof discordMsg !== 'object' ||
    !('createMessageComponentCollector' in discordMsg)
  ) {
    return;
  }

  const collector = discordMsg.createMessageComponentCollector({
    time: 120_000,
  });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== ctx.user.id) {
      await interaction.reply({ content: '⏳ This is not your inventory!', ephemeral: true });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'inv:select_item') {
      const idx = parseInt(interaction.values[0] ?? '0', 10);
      if (!isNaN(idx) && idx >= 0 && idx < items.length) {
        selectedIndex = idx;
      }
      const updatedEmbed = buildInvEmbed(items, selectedIndex);
      const updatedComponents = buildInvComponents(items, selectedIndex);
      await interaction
        .update({ embeds: [updatedEmbed], components: updatedComponents })
        .catch(() => {});
      return;
    }

    if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId.startsWith('inv:filter:')) {
        const filterType = customId.split(':')[2] as 'ALL' | 'GEAR' | 'POTIONS';
        activeFilter = filterType;
        items = await loadItems();
        selectedIndex = 0;
        const updatedEmbed = buildInvEmbed(items, selectedIndex);
        const updatedComponents = items.length > 0 ? buildInvComponents(items, selectedIndex) : [];
        await interaction
          .update({ embeds: [updatedEmbed], components: updatedComponents })
          .catch(() => {});
        return;
      }

      if (customId.startsWith('inv:action:use:')) {
        const invId = customId.split(':')[3]!;
        try {
          const result = await services.consumableService.useItem(userId, invId);
          let notice = '';
          if (result.success) {
            if (result.type === 'ENERGY') {
              notice = `⚡ **Energy Replenished!** Recovered +${result.restoredAmount} Energy! (${result.userEnergy} Energy, ${result.potsUsedToday}/3 daily)`;
            } else {
              notice = `🧪 **Consumed Potion!** Restored +${result.restoredAmount} ${result.type}!`;
            }
          } else {
            notice = `❌ **Consumption Failed**: ${result.reason}`;
          }
          items = await loadItems();
          if (selectedIndex >= items.length) selectedIndex = Math.max(0, items.length - 1);
          const updatedEmbed = buildInvEmbed(items, selectedIndex, notice);
          const updatedComponents =
            items.length > 0 ? buildInvComponents(items, selectedIndex) : [];
          await interaction
            .update({ embeds: [updatedEmbed], components: updatedComponents })
            .catch(() => {});
        } catch (err: unknown) {
          await interaction.reply({
            content: `❌ Error using item: ${err instanceof Error ? err.message : String(err)}`,
            ephemeral: true,
          });
        }
        return;
      }

      if (customId.startsWith('inv:action:enhance:')) {
        const invId = customId.split(':')[3]!;
        try {
          const balance = await services.economyRepo.getOrCreateBalance(userId);
          const userCredits = BigInt(balance.walletBalance);
          const enhanceResult = await services.enhancementService.enhance(
            userId,
            invId,
            userCredits,
          );

          if (enhanceResult.creditsSpent > 0) {
            await services.economyRepo.modifyBalance({
              userId,
              walletDelta: -enhanceResult.creditsSpent,
              type: 'ENHANCE_ITEM',
              source: 'TCG_FORGE',
              metadata: { newLevel: enhanceResult.newLevel },
              guildId: ctx.guild?.id,
            });
          }

          const notice = `✨ **Enhancement Succeeded!** +${enhanceResult.previousLevel} ➜ **+${enhanceResult.newLevel}**! (Spent: ${enhanceResult.creditsSpent} credits, ${enhanceResult.dustSpent} dust)`;
          items = await loadItems();
          const updatedEmbed = buildInvEmbed(items, selectedIndex, notice);
          const updatedComponents = buildInvComponents(items, selectedIndex);
          await interaction
            .update({ embeds: [updatedEmbed], components: updatedComponents })
            .catch(() => {});
        } catch (err: unknown) {
          await interaction.reply({
            content: `❌ **Enhancement Failed**: ${err instanceof Error ? err.message : String(err)}`,
            ephemeral: true,
          });
        }
        return;
      }
    }
  });

  collector.on('end', async () => {
    if (items.length > 0) {
      const disabledComponents = buildInvComponents(items, selectedIndex);
      for (const row of disabledComponents) {
        for (const comp of row.components) {
          comp.setDisabled(true);
        }
      }
      await discordMsg.edit({ components: disabledComponents }).catch(() => {});
    }
  });
}

async function handleEnhance(
  ctx: CommandContext,
  services: BotServices,
  rawArgs: readonly string[],
): Promise<void> {
  const userId = ctx.user.id;
  const userItemId = ctx.options.getString('id') ?? rawArgs[1];

  if (!userItemId) {
    await ctx.reply({
      content:
        '❌ Please specify the inventory item ID to enhance. Usage: `/item action:enhance id:<item_id>`',
    });
    return;
  }

  // 1. Fetch user item & definition
  const invItem = await services.userInventoryItemRepo.findById(userItemId);
  if (!invItem || invItem.userId !== userId) {
    await ctx.reply({ content: '❌ Item not found in your inventory.' });
    return;
  }

  const itemDef = await services.gameItemRepo.findById(invItem.itemId);
  if (!itemDef) {
    await ctx.reply({ content: '❌ Item definition not found in catalog.' });
    return;
  }

  try {
    const result = await enhanceGear(services, userId, userItemId, {
      guildId: ctx.guild?.id,
      itemCode: itemDef.code,
    });

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`✨ Enhancement Succeeded! +${result.previousLevel} ➜ +${result.newLevel}`)
      .setDescription(
        `Successfully reinforced **${itemDef.name}** to **+${result.newLevel}**!\n\n` +
          `• **Crafting Dust Spent**: \`${result.dustSpent} Dust\` (${result.dustLeft} left)\n` +
          `• **Credits Spent**: \`${result.creditsSpent} credits\`\n\n` +
          `📈 **Reinforced Base Stats (+8% / level)**:\n` +
          Object.entries(result.scaledStats)
            .map(([k, v]) => `  • **${k.toUpperCase()}**: +${v}`)
            .join('\n') +
          (result.scaledPerks.length > 0
            ? `\n\n🔥 **Active Battle Perks**:\n  • ${result.scaledPerks.join(', ')}`
            : ''),
      )
      .setFooter({ text: 'The Celestial Forge smiles upon your craftsmanship.' });

    await ctx.reply({ embeds: [embed] });
  } catch (err: unknown) {
    await ctx.reply({
      content: `❌ **Enhancement Failed**: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function handleUse(
  ctx: CommandContext,
  services: BotServices,
  rawArgs: readonly string[],
): Promise<void> {
  const userId = ctx.user.id;
  const userItemId = ctx.options.getString('id') ?? rawArgs[1];

  if (!userItemId) {
    await ctx.reply({
      content:
        '❌ Please specify the inventory item ID to consume. Usage: `/item action:use id:<item_id>`',
    });
    return;
  }

  try {
    const result = await services.consumableService.useItem(userId, userItemId);

    if (!result.success) {
      await ctx.reply({
        content: `❌ **Consumption Failed**: ${result.reason}`,
      });
      return;
    }

    if (result.type === 'ENERGY') {
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle('⚡ Stamina Replenished!')
        .setDescription(
          `Consumed energy potion and recovered **+${result.restoredAmount} Energy**!\n` +
            `• **Current Energy**: \`${result.userEnergy} Energy\`\n` +
            `• **Daily Potions Used**: \`${result.potsUsedToday} / 3\``,
        )
        .setFooter({ text: 'Anti-abuse limit: 3 energy potions per calendar day' });

      await ctx.reply({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🧪 Consumable Used!')
      .setDescription(
        `Successfully restored **+${result.restoredAmount} ${result.type}**!` +
          (result.cleansedDebuffs
            ? '\n✨ All active status effects and debuffs were cleansed!'
            : ''),
      );

    await ctx.reply({ embeds: [embed] });
  } catch (err: unknown) {
    await ctx.reply({
      content: `❌ **Error consuming item**: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/** Resolves a user-typed recipe code against the recipe list, by recipe code, output item code, or
 *  output code with the `CRAFT_` prefix omitted (e.g. `WEAPON_OBSIDIAN_KATANA`). */
/**
 * Standalone `/craft` (prefix `craft`, `forge`): a shortcut for `/item action:craft` so crafting shows
 * up as its own entry in help.
 */
export function createCraftCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'craft',
      category: CommandCategory.TCG,
      description:
        'Craft gear & potions from Crafting Dust (opens the crafting menu when no recipe is given).',
      aliases: ['forge'],
      usage: '/craft [recipe] [quantity]',
      examples: [
        '/craft',
        '/craft recipe:WEAPON_OBSIDIAN_KATANA',
        '/craft recipe:POTION_MAJOR_HP quantity:3',
      ],
      options: [
        {
          name: 'recipe',
          description:
            'Recipe code or item code to craft directly (omit to open the crafting menu)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'quantity',
          description: 'How many to craft (equipment/accessories are capped at 1, potions at 10)',
          type: 'INTEGER',
          required: false,
          minValue: 1,
          maxValue: 10,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      // handleCraft reads prefix args after the action word, as in `item craft <recipe> <qty>`.
      await handleCraft(ctx, services, ['craft', ...(ctx.options.getRawArgs?.() ?? [])]);
    },
  };
}

function resolveRecipeCode(input: string, statuses: RecipeStatus[]): string | undefined {
  const normalized = input.trim().toUpperCase();
  return (
    statuses.find((s) => s.recipe.code === normalized)?.recipe.code ??
    statuses.find((s) => s.outputItem.code === normalized)?.recipe.code ??
    statuses.find((s) => s.recipe.code === `CRAFT_${normalized}`)?.recipe.code
  );
}

export async function handleCraft(
  ctx: CommandContext,
  services: BotServices,
  rawArgs: readonly string[],
): Promise<void> {
  const userId = ctx.user.id;
  const recipeInput = ctx.options.getString('recipe') ?? rawArgs[1];
  const rawQuantity =
    ctx.options.getInteger('quantity') ??
    (rawArgs[2] ? Number.parseInt(rawArgs[2], 10) : undefined);
  const quantity =
    rawQuantity && Number.isInteger(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1;

  // No recipe given: open the interactive crafting menu instead of a direct craft.
  if (!recipeInput) {
    await openCraftMenu(ctx, services);
    return;
  }

  try {
    const statuses = await services.craftingService.listRecipes(userId);
    const resolvedCode = resolveRecipeCode(recipeInput, statuses);
    if (!resolvedCode) {
      await ctx.reply({
        content: `❌ Unknown crafting recipe: \`${recipeInput}\`. Run \`/craft\` with no recipe to browse the crafting menu.`,
      });
      return;
    }
    const status = statuses.find((s) => s.recipe.code === resolvedCode);

    const receipt = await services.craftingService.craft(userId, resolvedCode, quantity);
    const dustLeft = await services.enhancementService.getDustBalance(userId);
    const ingredientNames = receipt.ingredientsSpent.map((ing) => {
      const name = status?.ingredients.find((i) => i.code === ing.code)?.name ?? ing.code;
      return `${ing.quantity}x ${name}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`🔨 Crafted ${receipt.outputQuantity}x ${receipt.outputItem.name}!`)
      .setDescription(
        `Successfully forged **${receipt.outputQuantity}x ${receipt.outputItem.name}**!\n\n` +
          `• **Crafting Dust Spent**: \`${receipt.dustSpent} Dust\` (${dustLeft} left)\n` +
          `• **Credits Spent**: \`${receipt.creditsSpent} credits\` (Wallet: ${receipt.walletBalanceAfter.toLocaleString()})\n` +
          (ingredientNames.length > 0
            ? `• **Ingredients Used**: ${ingredientNames.join(', ')}\n`
            : ''),
      )
      .setFooter({ text: 'The Celestial Forge answers your call.' });

    await ctx.reply({ embeds: [embed] });
  } catch (err: unknown) {
    await ctx.reply({
      content: `❌ **Crafting Failed**: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
