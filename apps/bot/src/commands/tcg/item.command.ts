import {
  EmbedBuilder,
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
  const filter = ctx.options.getString('filter')?.toUpperCase() ?? (rawArgs[1]?.toUpperCase() || undefined);

  const inventoryItems = await services.userInventoryItemRepo.findByUser(userId);

  if (inventoryItems.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎒 Summoner Gear & Item Inventory')
      .setDescription(
        'Your inventory is currently empty.\nVisit the Town Shop (`/game shop` or `/shop`) or explore dungeons to acquire gear and consumables!',
      );
    await ctx.reply({ embeds: [embed] });
    return;
  }

  // Fetch definitions
  const detailedItems = await Promise.all(
    inventoryItems.map(async (inv) => {
      const def = await services.gameItemRepo.findById(inv.itemId);
      return { inv, def };
    }),
  );

  const filtered = detailedItems.filter((entry) => {
    if (!entry.def) return false;
    if (!filter) return true;
    return entry.def.type === filter || entry.def.subtype === filter;
  });

  if (filtered.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🎒 Inventory Filter')
      .setDescription(`No items found matching filter \`${filter}\`.`);
    await ctx.reply({ embeds: [embed] });
    return;
  }

  const lines = filtered.map(({ inv, def }) => {
    if (!def) return '';
    const enhancementTag = inv.enhancementLevel > 0 ? ` **+${inv.enhancementLevel}**` : '';
    const stateTag = inv.state === 'EQUIPPED' ? ` \`[EQUIPPED: ${inv.slot}]\`` : '';
    const qtyTag = def.type === 'CONSUMABLE' ? ` (x${inv.quantity})` : '';

    const perkText =
      def.battlePerks && def.battlePerks.length > 0
        ? ` | *Perk: ${def.battlePerks.join(', ')}*`
        : '';

    return `• **${def.name}**${enhancementTag}${qtyTag}${stateTag} — [${def.rarity}] (\`ID: ${inv.id}\`)${perkText}\n  *${def.description}*`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🎒 ${ctx.user.username}'s Gear & Consumables (${filtered.length} items)`)
    .setDescription(lines.join('\n\n'))
    .setFooter({
      text: 'Use /item enhance <id> to enhance gear | /item use <id> to consume potions',
    });

  await ctx.reply({ embeds: [embed] });
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
