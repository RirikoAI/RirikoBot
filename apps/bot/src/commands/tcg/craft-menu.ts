import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type Message,
} from 'discord.js';
import type { CommandContext } from '@ririko/discord';
import { ALL_GEAR_SLOTS, type EquipmentStats, type GearSlot, type RecipeStatus } from '@ririko/services';
import type { BotServices } from '../../services.js';
import { formatStats } from './gear-menu.js';

/** The gear slots plus a combined "Potions" bucket (HP_POTION + MANA_POTION recipes). */
export type CraftCategory = GearSlot | 'POTIONS';

const CATEGORY_LABELS: Record<CraftCategory, string> = {
  WEAPON: '⚔️ Weapon',
  ARMOR: '🛡️ Armor',
  RELIC: '🔮 Relic',
  RING: '💍 Ring',
  AMULET: '📿 Amulet',
  TALISMAN: '🪶 Talisman',
  POTIONS: '🧪 Potions',
};

const CRAFT_CATEGORIES: CraftCategory[] = [...ALL_GEAR_SLOTS, 'POTIONS'];

function matchesCategory(status: RecipeStatus, category: CraftCategory): boolean {
  const subtype = status.outputItem.subtype;
  if (category === 'POTIONS') return subtype === 'HP_POTION' || subtype === 'MANA_POTION';
  return subtype === category;
}

function recipeIcon(status: RecipeStatus): string {
  const subtype = status.outputItem.subtype;
  if (subtype === 'HP_POTION') return '🧪';
  if (subtype === 'MANA_POTION') return '🔷';
  return status.outputItem.type === 'ACCESSORY' ? '💍' : '⚔️';
}

/** Short status marker for a recipe list/select entry: locked, affordable, or short of something. */
function statusMarker(status: RecipeStatus): string {
  if (!status.unlocked) return `🔒 Floor ${status.requiredFloor}`;
  return status.affordable ? '✅ Ready' : '❌ Short';
}

export interface CraftMenuState {
  category: CraftCategory;
  /** Every recipe (all categories) - used to keep dust/credit balances current across category switches. */
  allRecipes: RecipeStatus[];
  /** allRecipes filtered to `category`. */
  recipes: RecipeStatus[];
  page?: number | undefined;
  selectedIndex: number;
  dust: number;
  credits: number;
  notice?: string | undefined;
}

/** Embed and components for the interactive crafting menu. Pure: no I/O. */
export function buildCraftMenuView(state: CraftMenuState): {
  embed: EmbedBuilder;
  components: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>>;
} {
  const page = state.page ?? 0;
  const PAGE_SIZE = 25;
  const totalPages = Math.max(1, Math.ceil(state.recipes.length / PAGE_SIZE));
  const effectivePage = Math.max(0, Math.min(page, totalPages - 1));
  const pagedRecipes = state.recipes.slice(
    effectivePage * PAGE_SIZE,
    (effectivePage + 1) * PAGE_SIZE,
  );

  const selected = state.recipes[state.selectedIndex];

  const lines = pagedRecipes.map((status, idxOnPage) => {
    const globalIdx = effectivePage * PAGE_SIZE + idxOnPage;
    const marker = globalIdx === state.selectedIndex ? '👉 ' : '• ';
    return (
      `${marker}${recipeIcon(status)} **${status.outputItem.name}** — ` +
      `🧪 ${status.recipe.dustCost} Dust + 🪙 ${status.recipe.creditCost}c [${statusMarker(status)}]`
    );
  });

  let detail = '';
  if (selected) {
    const stats = (selected.outputItem.baseStats ?? {}) as EquipmentStats;
    const lockLine = selected.unlocked
      ? `Unlocked (highest cleared floor: ${selected.userHighestFloor})`
      : `🔒 Locked — requires clearing floor **${selected.requiredFloor}** (you're at ${selected.userHighestFloor})`;

    const ingredientLines = selected.ingredients.map(
      (i) => `  • ${i.sufficient ? '✅' : '❌'} ${i.name} x${i.requiredPerCraft} (have ${i.owned})`,
    );

    detail =
      `\n\n🎯 **${selected.outputItem.name}** [${selected.outputItem.rarity} ${selected.outputItem.subtype}]` +
      `\n*${selected.outputItem.description}*` +
      `\nOutput stats: ${formatStats(stats)}` +
      (selected.outputItem.battlePerks?.length ? `\n🔥 Perk: ${selected.outputItem.battlePerks.join(', ')}` : '') +
      `\n\n${lockLine}` +
      `\n${selected.ownedDust >= selected.recipe.dustCost ? '✅' : '❌'} Dust: ${selected.recipe.dustCost} (have ${selected.ownedDust})` +
      `\n${selected.ownedCredits >= selected.recipe.creditCost ? '✅' : '❌'} Credits: ${selected.recipe.creditCost} (have ${selected.ownedCredits})` +
      (ingredientLines.length > 0 ? `\nIngredients:\n${ingredientLines.join('\n')}` : '');
  }

  let paginationNote = '';
  if (state.recipes.length > PAGE_SIZE) {
    const start = effectivePage * PAGE_SIZE + 1;
    const end = Math.min((effectivePage + 1) * PAGE_SIZE, state.recipes.length);
    paginationNote = `\n\n📄 **Recipes**: Showing ${start}–${end} of ${state.recipes.length} (Page ${effectivePage + 1}/${totalPages})`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🔨 Crafting Workshop — ${CATEGORY_LABELS[state.category]}`)
    .setDescription(
      (state.notice ? `${state.notice}\n\n` : '') +
        (lines.length > 0 ? lines.join('\n') : '*No recipes in this category.*') +
        detail +
        paginationNote,
    )
    .setFooter({ text: `🧪 Crafting Dust: ${state.dust.toLocaleString()} | 🪙 Credits: ${state.credits.toLocaleString()}` });

  const categoryMenu = new StringSelectMenuBuilder()
    .setCustomId('craft:category')
    .setPlaceholder('Choose a category')
    .addOptions(
      CRAFT_CATEGORIES.map((cat) => ({
        label: CATEGORY_LABELS[cat],
        value: cat,
        default: cat === state.category,
      })),
    );

  const rows: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categoryMenu),
  ];

  if (state.recipes.length > 0) {
    const recipeMenuPlaceholder =
      totalPages > 1
        ? `Choose a recipe (Page ${effectivePage + 1}/${totalPages} · ${state.recipes.length} recipes)`
        : 'Choose a recipe';

    const recipeMenu = new StringSelectMenuBuilder()
      .setCustomId('craft:select_recipe')
      .setPlaceholder(recipeMenuPlaceholder)
      .addOptions(
        pagedRecipes.map((status, idxOnPage) => {
          const globalIdx = effectivePage * PAGE_SIZE + idxOnPage;
          return {
            label: `${recipeIcon(status)} ${status.outputItem.name}`.slice(0, 100),
            description: `${status.recipe.dustCost} Dust + ${status.recipe.creditCost}c — ${statusMarker(status)}`.slice(0, 100),
            value: String(globalIdx),
            default: globalIdx === state.selectedIndex,
          };
        }),
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(recipeMenu));
  }

  if (totalPages > 1) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('craft:prev')
          .setLabel('◀ Prev')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(effectivePage === 0),
        new ButtonBuilder()
          .setCustomId('craft:page_info')
          .setLabel(`Page ${effectivePage + 1} / ${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('craft:next')
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(effectivePage >= totalPages - 1),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('craft:craft')
        .setLabel(selected ? `🔨 Craft (${selected.recipe.dustCost} dust, ${selected.recipe.creditCost}c)` : '🔨 Craft')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!selected || !selected.unlocked || !selected.affordable),
      new ButtonBuilder().setCustomId('craft:close').setLabel('Close').setStyle(ButtonStyle.Danger),
    ),
  );

  return { embed, components: rows };
}

/** Loads everything the crafting menu shows for one category. */
export async function loadCraftMenuState(
  services: BotServices,
  userId: string,
  category: CraftCategory,
  selectedRecipeCode?: string | undefined,
  requestedPage?: number | undefined,
): Promise<CraftMenuState> {
  const allRecipes = await services.craftingService.listRecipes(userId);
  const recipes = allRecipes.filter((status) => matchesCategory(status, category));
  const foundIndex = selectedRecipeCode
    ? recipes.findIndex((status) => status.recipe.code === selectedRecipeCode)
    : -1;
  const selectedIndex = Math.max(0, foundIndex);

  const PAGE_SIZE = 25;
  const totalPages = Math.max(1, Math.ceil(recipes.length / PAGE_SIZE));
  let page = requestedPage !== undefined ? requestedPage : Math.floor(selectedIndex / PAGE_SIZE);
  page = Math.max(0, Math.min(page, totalPages - 1));

  return {
    category,
    allRecipes,
    recipes,
    page,
    selectedIndex,
    dust: allRecipes[0]?.ownedDust ?? 0,
    credits: allRecipes[0]?.ownedCredits ?? 0,
  };
}

/** Opens the interactive crafting menu: category picker, recipe picker, detail view, Craft & Close. */
export async function openCraftMenu(
  ctx: CommandContext,
  services: BotServices,
  initialCategory?: string | undefined,
): Promise<void> {
  const userId = ctx.user.id;
  const category: CraftCategory =
    initialCategory && CRAFT_CATEGORIES.includes(initialCategory.toUpperCase() as CraftCategory)
      ? (initialCategory.toUpperCase() as CraftCategory)
      : 'WEAPON';

  let state = await loadCraftMenuState(services, userId, category);
  const initial = buildCraftMenuView(state);
  const reply = await ctx.reply({ embeds: [initial.embed], components: initial.components });
  const message = (
    reply && typeof reply === 'object' && 'fetch' in reply
      ? await (reply as Message).fetch()
      : reply
  ) as Message | undefined;
  if (!message || typeof message !== 'object' || !('createMessageComponentCollector' in message))
    return;

  const collector = message.createMessageComponentCollector({ time: 180_000 });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: '⏳ This crafting menu belongs to someone else.',
        ephemeral: true,
      });
      return;
    }

    let notice: string | undefined;
    let nextCategory = state.category;
    let nextSelectedCode: string | undefined = state.recipes[state.selectedIndex]?.recipe.code;
    let nextPage = state.page ?? 0;

    try {
      if (interaction.isStringSelectMenu() && interaction.customId === 'craft:category') {
        nextCategory = (interaction.values[0] as CraftCategory) ?? state.category;
        nextSelectedCode = undefined;
        nextPage = 0;
      } else if (interaction.isStringSelectMenu() && interaction.customId === 'craft:select_recipe') {
        const idx = Number.parseInt(interaction.values[0] ?? '0', 10);
        nextSelectedCode = state.recipes[idx]?.recipe.code;
        nextPage = Math.floor(idx / 25);
      } else if (interaction.isButton() && interaction.customId === 'craft:prev') {
        nextPage = Math.max(0, (state.page ?? 0) - 1);
        nextSelectedCode = state.recipes[nextPage * 25]?.recipe.code;
      } else if (interaction.isButton() && interaction.customId === 'craft:next') {
        const totalPages = Math.ceil(state.recipes.length / 25);
        nextPage = Math.min(totalPages - 1, (state.page ?? 0) + 1);
        nextSelectedCode = state.recipes[nextPage * 25]?.recipe.code;
      } else if (interaction.isButton() && interaction.customId === 'craft:close') {
        collector.stop('closed');
        await interaction.update({ components: [] }).catch(() => {});
        return;
      } else if (interaction.isButton() && interaction.customId === 'craft:craft') {
        const selected = state.recipes[state.selectedIndex];
        if (selected) {
          const receipt = await services.craftingService.craft(userId, selected.recipe.code, 1);
          const ingredientNames = receipt.ingredientsSpent.map((ing) => {
            const name = selected.ingredients.find((i) => i.code === ing.code)?.name ?? ing.code;
            return `${ing.quantity}x ${name}`;
          });
          notice =
            `✅ **Crafted ${receipt.outputQuantity}x ${receipt.outputItem.name}**! ` +
            `(−${receipt.dustSpent} dust, −${receipt.creditsSpent} credits` +
            (ingredientNames.length > 0 ? `, consumed ${ingredientNames.join(', ')}` : '') +
            ')';
          nextSelectedCode = selected.recipe.code;
        }
      }
    } catch (err: unknown) {
      notice = `❌ **Craft Failed**: ${err instanceof Error ? err.message : String(err)}`;
    }

    state = await loadCraftMenuState(services, userId, nextCategory, nextSelectedCode, nextPage);
    state.notice = notice;
    const view = buildCraftMenuView(state);
    await interaction.update({ embeds: [view.embed], components: view.components }).catch(() => {});
  });

  collector.on('end', async (_collected, reason) => {
    if (reason !== 'closed') await message.edit({ components: [] }).catch(() => {});
  });
}
