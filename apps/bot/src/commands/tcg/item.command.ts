import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type Message,
} from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { ALL_GEAR_SLOTS } from '@ririko/services';

export function createItemCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'item',
      category: CommandCategory.TCG,
      description: 'Manage, inspect, enhance, and consume TCG equipment, accessories, and potions.',
      aliases: ['tcgitem', 'gear', 'items'],
      usage: '/item [action: inventory|enhance|use] [id] [filter] [card_id]',
      examples: [
        '/item action:inventory filter:EQUIPMENT',
        '/item action:enhance id:12345678',
        '/item action:use id:12345678',
      ],
      options: [
        {
          name: 'action',
          description: 'Subcommand action to execute (inventory, enhance, use)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Inventory (View owned equipment, accessories & potions)', value: 'inventory' },
            { name: 'Enhance (Upgrade equipment from +0 to +10)', value: 'enhance' },
            { name: 'Use (Consume an HP, Mana, or Energy potion)', value: 'use' },
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
        if (['inventory', 'inv', 'enhance', 'upgrade', 'use', 'consume'].includes(firstArg)) {
          sub = firstArg;
        }
      }

      if (sub === 'inv') sub = 'inventory';
      if (sub === 'upgrade') sub = 'enhance';
      if (sub === 'consume') sub = 'use';

      switch (sub) {
        case 'enhance':
          await handleEnhance(ctx, services, rawArgs);
          break;
        case 'use':
          await handleUse(ctx, services, rawArgs);
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

  const rawFilter = (ctx.options.getString('filter')?.toUpperCase() ?? rawArgs[1]?.toUpperCase() ?? '');
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

    return detailed.filter((entry): entry is { inv: typeof entry.inv; def: NonNullable<typeof entry.def> } => {
      if (!entry.def) return false;
      if (activeFilter === 'GEAR') {
        return entry.def.type === 'EQUIPMENT' || entry.def.type === 'ACCESSORY';
      }
      if (activeFilter === 'POTIONS') {
        return entry.def.type === 'CONSUMABLE';
      }
      return true;
    });
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
      const qtyTag = def.type === 'CONSUMABLE' ? ` (x${inv.quantity})` : '';
      const perkText = def.battlePerks && def.battlePerks.length > 0 ? ` | *Perk: ${def.battlePerks.join(', ')}*` : '';
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
            (selected.def.type === 'CONSUMABLE' ? ` (Quantity: ${selected.inv.quantity})` : ` (Enhancement: +${selected.inv.enhancementLevel})`) +
            `\n*${selected.def.description}*`
          : ''),
      )
      .setFooter({ text: 'Select an item to use or enhance | Filter categories with buttons below' });

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
      const icon = def.subtype === 'HP_POTION' ? '🧪' : def.subtype === 'MANA_POTION' ? '🔷' : isConsumable ? '⚡' : '⚔️';
      const detailTag = isConsumable ? `(x${inv.quantity})` : inv.enhancementLevel > 0 ? `(+${inv.enhancementLevel})` : '';

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
    } else if (selected && (selected.def.type === 'EQUIPMENT' || selected.def.type === 'ACCESSORY')) {
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

  if (!discordMsg || typeof discordMsg !== 'object' || !('createMessageComponentCollector' in discordMsg)) {
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
      await interaction.update({ embeds: [updatedEmbed], components: updatedComponents }).catch(() => {});
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
        await interaction.update({ embeds: [updatedEmbed], components: updatedComponents }).catch(() => {});
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
          const updatedComponents = items.length > 0 ? buildInvComponents(items, selectedIndex) : [];
          await interaction.update({ embeds: [updatedEmbed], components: updatedComponents }).catch(() => {});
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
          const userDust = 5000;

          const enhanceResult = await services.enhancementService.enhance(
            userId,
            invId,
            userDust,
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
          await interaction.update({ embeds: [updatedEmbed], components: updatedComponents }).catch(() => {});
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
      content: '❌ Please specify the inventory item ID to enhance. Usage: `/item action:enhance id:<item_id>`',
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

  // 2. Fetch user balances (Crafting Dust from userCards or items, and credits)
  const balance = await services.economyRepo.getOrCreateBalance(userId);
  const userCredits = BigInt(balance.walletBalance);

  // For Crafting Dust: calculate dust from user card dismantle or default allowance
  const userCards = await services.waifuCardRepo.listUserCards(userId);
  // Estimate dust or use 5000 dust for active testing
  const userDust = 5000;

  try {
    const result = await services.enhancementService.enhance(
      userId,
      userItemId,
      userDust,
      userCredits,
    );

    // Deduct credits from economy balance
    if (result.creditsSpent > 0) {
      await services.economyRepo.modifyBalance({
        userId,
        walletDelta: -result.creditsSpent,
        type: 'ENHANCE_ITEM',
        source: 'TCG_FORGE',
        metadata: { itemCode: itemDef.code, newLevel: result.newLevel },
        guildId: ctx.guild?.id,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`✨ Enhancement Succeeded! +${result.previousLevel} ➜ +${result.newLevel}`)
      .setDescription(
        `Successfully reinforced **${itemDef.name}** to **+${result.newLevel}**!\n\n` +
          `• **Crafting Dust Spent**: \`${result.dustSpent} Dust\`\n` +
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
      content: '❌ Please specify the inventory item ID to consume. Usage: `/item action:use id:<item_id>`',
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
          (result.cleansedDebuffs ? '\n✨ All active status effects and debuffs were cleansed!' : ''),
      );

    await ctx.reply({ embeds: [embed] });
  } catch (err: unknown) {
    await ctx.reply({
      content: `❌ **Error consuming item**: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
