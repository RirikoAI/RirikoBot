import {
  EmbedBuilder,
  type ActionRowBuilder,
  type ButtonBuilder,
  type Message,
  type StringSelectMenuBuilder,
  MessageFlags,
} from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
  type CommandOptionDefinition,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { enhanceGear } from './gear-actions.js';
import { openCraftMenu } from './craft-menu.js';
import {
  ITEM_CATEGORIES,
  ITEM_CUSTOM_IDS,
  buildItemsView,
  entriesInCategory,
  loadItemEntries,
  loadItemsOverview,
  pageCount,
  parseItemCategory,
  selectedEntry,
  type ItemCategory,
  type ItemsViewState,
} from './items-menu.js';
import { LEGACY_ITEM_CODE_ALIASES } from '@ririko/services';
import type { RecipeStatus } from '@ririko/services';

const ACTION_WORDS: Record<string, 'view' | 'use' | 'enhance' | 'craft'> = {
  view: 'view',
  inventory: 'view',
  inv: 'view',
  list: 'view',
  use: 'use',
  consume: 'use',
  enhance: 'enhance',
  upgrade: 'enhance',
  craft: 'craft',
  forge: 'craft',
};

const ITEMS_OPTIONS: CommandOptionDefinition[] = [
  {
    name: 'action',
    description: 'What to do (default: view your items)',
    type: 'STRING',
    required: false,
    choices: [
      { name: 'View (Browse your items by category)', value: 'view' },
      { name: 'Use (Consume a potion or bag item)', value: 'use' },
      { name: 'Enhance (Upgrade equipment from +0 to +10)', value: 'enhance' },
      { name: 'Craft (Forge gear & potions from Crafting Dust)', value: 'craft' },
    ],
  },
  {
    name: 'item',
    description: 'Inventory item ID or item code to use or enhance',
    type: 'STRING',
    required: false,
  },
  {
    name: 'category',
    description: 'Category to open when viewing',
    type: 'STRING',
    required: false,
    choices: [
      { name: 'Overview', value: 'overview' },
      { name: 'Equipment', value: 'equipment' },
      { name: 'Accessories', value: 'accessories' },
      { name: 'Potions (HP and mana)', value: 'potions' },
      { name: 'Energy', value: 'energy' },
      { name: 'Materials', value: 'materials' },
      { name: 'Bag (shop items)', value: 'bag' },
    ],
  },
  {
    name: 'target',
    description: 'Member whose items to view (view only)',
    type: 'USER',
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
    description: 'How many to use or craft (1 to 10)',
    type: 'INTEGER',
    required: false,
    minValue: 1,
    maxValue: 10,
  },
];

/**
 * `/items`: browse gear, potions, energy items, materials and bag items by category, and use,
 * enhance or craft from the same menu or by action. `/use`, `/consume` and `/item` stay prefix
 * aliases of it.
 */
export function createItemsCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'items',
      category: CommandCategory.TCG,
      description: 'Browse, use, enhance and craft your gear, potions, energy items and bag items.',
      aliases: ['item', 'tcgitem', 'use', 'consume'],
      usage: '/items [action: view|use|enhance|craft] [item] [category] [target] [quantity]',
      examples: [
        '/items',
        '/items category:potions',
        '/items action:use item:energy_potion quantity:2',
        '/items action:enhance item:12345678',
        '/items action:craft recipe:CRAFT_POTION_MAJOR_HP quantity:3',
        '!use energy_potion 2',
      ],
      options: ITEMS_OPTIONS,
    },
    execute: (ctx) => runItems(ctx, services),
  };
}

/** `/inventory` (prefix `inv`, `bag`): the same handler as `/items`, in the economy category so
 *  a server that turns the TCG module off keeps it. */
export function createInventoryCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'inventory',
      category: CommandCategory.ECONOMY,
      description: 'Browse your items, potions and bag by category (same as /items).',
      aliases: ['inv', 'bag'],
      usage: '/inventory [action: view|use|enhance|craft] [item] [category] [target] [quantity]',
      examples: ['/inventory', '/inventory category:bag', '/inventory target:@member'],
      options: ITEMS_OPTIONS,
    },
    execute: (ctx) => runItems(ctx, services),
  };
}

async function runItems(ctx: CommandContext, services: BotServices): Promise<void> {
  const rawArgs = ctx.options.getRawArgs?.() ?? [];
  const invoked = (ctx.invokedName ?? '').toLowerCase();
  let action = ACTION_WORDS[ctx.options.getString('action')?.toLowerCase() ?? ''];
  let args: readonly string[] = rawArgs;

  if (action) {
    // A slash action or a prefix action word: drop the word from the arguments.
    if (ACTION_WORDS[rawArgs[0]?.toLowerCase() ?? ''] === action) args = rawArgs.slice(1);
  } else if (invoked === 'use' || invoked === 'consume') {
    action = 'use';
  } else if (rawArgs[0] && ACTION_WORDS[rawArgs[0].toLowerCase()]) {
    action = ACTION_WORDS[rawArgs[0].toLowerCase()];
    args = rawArgs.slice(1);
  }

  switch (action) {
    case 'use':
      await handleUse(ctx, services, args);
      break;
    case 'enhance':
      await handleEnhance(ctx, services, args);
      break;
    case 'craft':
      await handleCraft(ctx, services, ['craft', ...args]);
      break;
    default:
      await handleView(ctx, services, args);
      break;
  }
}

const parseQuantity = (value: number | string | null | undefined): number => {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return n && Number.isInteger(n) && n > 0 ? n : 1;
};

type ItemsRow = ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>;

async function handleView(
  ctx: CommandContext,
  services: BotServices,
  args: readonly string[],
): Promise<void> {
  const viewer = ctx.user;
  const target = (await ctx.options.getUser?.('target')) ?? viewer;
  const readOnly = target.id !== viewer.id;
  const category: ItemCategory =
    parseItemCategory(ctx.options.getString('category')) ??
    parseItemCategory(args[0]) ??
    'OVERVIEW';

  const load = async () => ({
    entries: await loadItemEntries(services, target.id),
    overview: await loadItemsOverview(services, target.id),
  });

  let state: ItemsViewState = {
    ownerName: target.username,
    category,
    page: 0,
    ...(await load()),
    readOnly,
  };

  const initial = buildItemsView(state);
  const replyMsg = await ctx.reply({ embeds: [initial.embed], components: initial.components });
  const discordMsg = (
    replyMsg && typeof replyMsg === 'object' && 'fetch' in replyMsg
      ? await (replyMsg as { fetch: () => Promise<Message> }).fetch()
      : replyMsg
  ) as Message | undefined;

  if (
    !discordMsg ||
    typeof discordMsg !== 'object' ||
    !('createMessageComponentCollector' in discordMsg)
  ) {
    return;
  }

  const collector = discordMsg.createMessageComponentCollector({ time: 120_000 });

  const refresh = async (notice?: string) => {
    state = { ...state, ...(await load()) };
    const inCategory = entriesInCategory(state.entries, state.category);
    state.page = Math.min(state.page, pageCount(inCategory.length) - 1);
    state.notice = notice;
  };

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== viewer.id) {
      await interaction.reply({
        content: '⏳ This is not your inventory!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const id = interaction.customId;
      state.notice = undefined;

      if (interaction.isStringSelectMenu() && id === ITEM_CUSTOM_IDS.category) {
        const picked = interaction.values[0] as ItemCategory | undefined;
        if (picked && ITEM_CATEGORIES.includes(picked)) {
          state = { ...state, category: picked, page: 0, selectedKey: undefined };
        }
      } else if (interaction.isStringSelectMenu() && id === ITEM_CUSTOM_IDS.item) {
        state.selectedKey = interaction.values[0];
      } else if (
        interaction.isButton() &&
        (id === ITEM_CUSTOM_IDS.prev || id === ITEM_CUSTOM_IDS.next)
      ) {
        const pages = pageCount(entriesInCategory(state.entries, state.category).length);
        state.page = Math.min(
          Math.max(0, state.page + (id === ITEM_CUSTOM_IDS.next ? 1 : -1)),
          pages - 1,
        );
        state.selectedKey = undefined;
      } else if (interaction.isButton() && !readOnly) {
        const selected = selectedEntry(state);
        if (id === ITEM_CUSTOM_IDS.craft) {
          await interaction.deferUpdate().catch(() => {});
          await openCraftMenu(ctx, services);
          return;
        }
        let notice: string;
        if (id === ITEM_CUSTOM_IDS.use && selected?.canUse) {
          notice =
            selected.source === 'tcg'
              ? (await useTcgItem(services, viewer.id, selected.id, 1)).message
              : await useBagItem(services, viewer.id, selected.id, 1, ctx.guild?.id);
          await refresh(notice);
        } else if (id === ITEM_CUSTOM_IDS.enhance && selected?.canEnhance) {
          try {
            const result = await enhanceGear(services, viewer.id, selected.id, {
              guildId: ctx.guild?.id,
              itemCode: selected.code,
            });
            notice = `✨ **Enhancement Succeeded!** +${result.previousLevel} ➜ **+${result.newLevel}**! (Spent: ${result.creditsSpent} credits, ${result.dustSpent} dust)`;
          } catch (err: unknown) {
            notice = `❌ **Enhancement Failed**: ${err instanceof Error ? err.message : String(err)}`;
          }
          await refresh(notice);
        }
      }
    } catch (err: unknown) {
      state.notice = `❌ ${err instanceof Error ? err.message : String(err)}`;
    }

    const view = buildItemsView(state);
    await interaction
      .update({ embeds: [view.embed], components: view.components as ItemsRow[] })
      .catch(() => {});
  });

  collector.on('end', async () => {
    const view = buildItemsView({ ...state, disabled: true });
    await discordMsg.edit({ components: view.components as ItemsRow[] }).catch(() => {});
  });
}

interface UseOutcome {
  used: number;
  message: string;
}

/** Drinks a TCG consumable one at a time, up to `quantity`, and stops at the first failure. */
async function useTcgItem(
  services: BotServices,
  userId: string,
  userItemId: string,
  quantity: number,
): Promise<UseOutcome> {
  let used = 0;
  let restored = 0;
  let last: Awaited<ReturnType<BotServices['consumableService']['useItem']>> | undefined;
  let failure: string | undefined;

  for (let i = 0; i < quantity; i += 1) {
    try {
      const result = await services.consumableService.useItem(userId, userItemId);
      if (!result.success) {
        failure = result.reason ?? 'The item could not be used.';
        break;
      }
      used += 1;
      restored += result.restoredAmount;
      last = result;
    } catch (err: unknown) {
      failure = err instanceof Error ? err.message : String(err);
      break;
    }
  }

  if (used === 0 || !last) {
    return { used, message: `❌ **Consumption Failed**: ${failure ?? 'Nothing was used.'}` };
  }

  const head =
    last.type === 'ENERGY'
      ? `⚡ **Energy Replenished!** Used ${used}, recovered +${restored} energy (now ${last.userEnergy}, ${last.potsUsedToday} potion(s) used today).`
      : `🧪 **Consumed Potion!** Used ${used}, restored +${restored} ${last.type}!` +
        (last.cleansedDebuffs ? ' Status effects were cleansed.' : '');
  return { used, message: failure ? `${head}\n⚠️ Stopped: ${failure}` : head };
}

/** Uses a bag (economy) item. */
async function useBagItem(
  services: BotServices,
  userId: string,
  itemRef: string,
  quantity: number,
  guildId: string | undefined,
): Promise<string> {
  const res = await services.inventoryService.useItem({
    userId,
    itemId: itemRef,
    quantity,
    guildId,
  });
  if (!res.success) return `❌ **Cannot Use Item**: ${res.reason}`;
  const effect = res.effectSummary ? `\n**Effects Applied:** ${res.effectSummary}` : '';
  return `✨ **Consumed ${res.quantityUsed}x ${res.item?.name}!**${effect}\nRemaining in inventory: \`${res.remainingQuantity}\``;
}

/** Finds what a player typed to use: a TCG inventory item ID, a TCG item code they own, else a
 *  bag item. */
async function resolveUseTarget(
  services: BotServices,
  userId: string,
  ref: string,
): Promise<{ kind: 'tcg'; id: string } | { kind: 'bag'; ref: string } | null> {
  const byId = await services.userInventoryItemRepo.findById(ref);
  if (byId && byId.userId === userId) return { kind: 'tcg', id: byId.id };

  const code =
    LEGACY_ITEM_CODE_ALIASES[ref] ??
    LEGACY_ITEM_CODE_ALIASES[ref.toLowerCase()] ??
    ref.toUpperCase();
  const def = await services.gameItemRepo.findByCode(code);
  if (def) {
    const owned = (await services.userInventoryItemRepo.findByUser(userId)).find(
      (inv) => inv.itemId === def.id && inv.quantity > 0,
    );
    if (owned) return { kind: 'tcg', id: owned.id };
  }

  const bagItem = await services.inventoryService.getItem(ref);
  return bagItem ? { kind: 'bag', ref: bagItem.id } : null;
}

async function handleUse(
  ctx: CommandContext,
  services: BotServices,
  args: readonly string[],
): Promise<void> {
  const ref = ctx.options.getString('item') ?? args[0];
  if (!ref) {
    await ctx.reply({
      content: '❌ Please say which item to use. Usage: `/items action:use item:<id or code>`',
    });
    return;
  }
  const quantity = parseQuantity(ctx.options.getInteger('quantity') ?? args[1]);

  try {
    const target = await resolveUseTarget(services, ctx.user.id, ref);
    if (!target) {
      await ctx.reply({
        content: `❌ Unknown item: \`${ref}\`. Run \`/items\` to see your items and their IDs or codes.`,
      });
      return;
    }
    const message =
      target.kind === 'tcg'
        ? (await useTcgItem(services, ctx.user.id, target.id, quantity)).message
        : await useBagItem(services, ctx.user.id, target.ref, quantity, ctx.guild?.id);
    await ctx.reply({ content: message });
  } catch (err: unknown) {
    await ctx.reply({
      content: `❌ **Error consuming item**: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function handleEnhance(
  ctx: CommandContext,
  services: BotServices,
  args: readonly string[],
): Promise<void> {
  const userId = ctx.user.id;
  const userItemId = ctx.options.getString('item') ?? args[0];

  if (!userItemId) {
    await ctx.reply({
      content:
        '❌ Please specify the inventory item ID to enhance. Usage: `/items action:enhance item:<item_id>`',
    });
    return;
  }

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

/** Resolves a user-typed recipe code against the recipe list, by recipe code, output item code, or
 *  output code with the `CRAFT_` prefix omitted (e.g. `WEAPON_OBSIDIAN_KATANA`). */
/**
 * Standalone `/craft` (prefix `craft`, `forge`): a shortcut for `/items action:craft` so crafting shows
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
      // handleCraft reads prefix args after the action word, as in `items craft <recipe> <qty>`.
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
