import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import type { BotServices } from '../../services.js';

/** The categories the `/items` category menu offers. */
export const ITEM_CATEGORIES = [
  'OVERVIEW',
  'EQUIPMENT',
  'ACCESSORIES',
  'POTIONS',
  'ENERGY',
  'MATERIALS',
  'BAG',
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** Items per page: one Discord select menu holds 25 options. */
export const ITEMS_PAGE_SIZE = 25;

/** Discord rejects embed descriptions over 4096 characters, so keep whole lines within a budget. */
const LIST_CHAR_BUDGET = 3000;

export const ITEM_CUSTOM_IDS = {
  category: 'items:category',
  item: 'items:item',
  prev: 'items:prev',
  next: 'items:next',
  use: 'items:use',
  enhance: 'items:enhance',
  craft: 'items:craft',
} as const;

const CATEGORY_LABELS: Record<ItemCategory, { label: string; icon: string }> = {
  OVERVIEW: { label: 'Overview', icon: '🎒' },
  EQUIPMENT: { label: 'Equipment', icon: '⚔️' },
  ACCESSORIES: { label: 'Accessories', icon: '💍' },
  POTIONS: { label: 'Potions (HP and mana)', icon: '🧪' },
  ENERGY: { label: 'Energy', icon: '⚡' },
  MATERIALS: { label: 'Materials', icon: '🪨' },
  BAG: { label: 'Bag (shop items)', icon: '👜' },
};

const CATEGORY_WORDS: Record<string, ItemCategory> = {
  overview: 'OVERVIEW',
  all: 'OVERVIEW',
  equipment: 'EQUIPMENT',
  equipments: 'EQUIPMENT',
  gear: 'EQUIPMENT',
  weapons: 'EQUIPMENT',
  accessories: 'ACCESSORIES',
  accessory: 'ACCESSORIES',
  potions: 'POTIONS',
  potion: 'POTIONS',
  consumable: 'POTIONS',
  consumables: 'POTIONS',
  energy: 'ENERGY',
  materials: 'MATERIALS',
  material: 'MATERIALS',
  bag: 'BAG',
};

/** Reads a category word a player typed (slash choice or prefix argument). */
export function parseItemCategory(input: string | null | undefined): ItemCategory | undefined {
  if (!input) return undefined;
  const typed = input.trim().toLowerCase();
  return CATEGORY_WORDS[typed] ?? CATEGORY_WORDS[typed.replace(/s$/, '')];
}

/** One owned item, from the TCG gear inventory or the economy bag. */
export interface ItemEntry {
  key: string;
  source: 'tcg' | 'bag';
  category: ItemCategory;
  /** The inventory item ID (TCG) or the economy item ID (bag). */
  id: string;
  code: string;
  name: string;
  rarity: string;
  description: string;
  quantity: number;
  level: number;
  perks: string[];
  slot?: string | undefined;
  wornBy?: string | undefined;
  stackable: boolean;
  canUse: boolean;
  canEnhance: boolean;
  /** Why the item has no Use button, shown in its details. */
  hint?: string | undefined;
}

export interface ItemsOverview {
  energy?: { current: number; max: number; bonus: number } | undefined;
  potionsUsed?: number | undefined;
  potionLimit?: number | undefined;
  dust?: number | undefined;
}

export interface ItemsViewState {
  ownerName: string;
  category: ItemCategory;
  page: number;
  selectedKey?: string | undefined;
  entries: readonly ItemEntry[];
  overview: ItemsOverview;
  readOnly: boolean;
  notice?: string | undefined;
  /** True when the view is disabled because the collector ended. */
  disabled?: boolean | undefined;
}

const BAG_USABLE_TYPES = new Set(['ENERGY_RESTORE', 'XP_GRANT', 'CREDITS_GRANT', 'GENERIC']);

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Names the card that wears each distinct gear card ID, looking each card up once. A card that
 *  cannot be found keeps its card ID as the name, so stranded gear never fails the view. */
async function loadWearerNames(
  services: BotServices,
  cardIds: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const cardId of new Set(cardIds)) {
    let name = cardId;
    try {
      const userCard = await services.waifuCardRepo.findUserCardById(cardId);
      const base = userCard ? await services.waifuCardRepo.findById(userCard.cardId) : null;
      if (base) name = base.name;
    } catch {
      // Keep the card ID as the name when the lookup fails.
    }
    names.set(cardId, name);
  }
  return names;
}

function tcgCategory(type: string, subtype: string): ItemCategory {
  if (type === 'EQUIPMENT') return 'EQUIPMENT';
  if (type === 'ACCESSORY') return 'ACCESSORIES';
  if (type === 'CONSUMABLE') return subtype === 'ENERGY_POTION' ? 'ENERGY' : 'POTIONS';
  return 'MATERIALS';
}

/** Loads the TCG gear inventory and the economy bag of one user as one list of entries. */
export async function loadItemEntries(services: BotServices, userId: string): Promise<ItemEntry[]> {
  const entries: ItemEntry[] = [];

  const inventoryItems = await services.userInventoryItemRepo.findByUser(userId);
  const detailed = await Promise.all(
    inventoryItems.map(async (inv) => ({
      inv,
      def: await services.gameItemRepo.findById(inv.itemId),
    })),
  );
  const known = detailed.filter(
    (entry): entry is { inv: typeof entry.inv; def: NonNullable<typeof entry.def> } =>
      entry.def !== null && entry.def !== undefined,
  );
  const wearerNames = await loadWearerNames(
    services,
    known.flatMap(({ inv }) =>
      inv.state === 'EQUIPPED' && inv.equippedToCardId ? [inv.equippedToCardId] : [],
    ),
  );

  for (const { inv, def } of known) {
    const category = tcgCategory(def.type, def.subtype);
    const isEnergy = category === 'ENERGY';
    entries.push({
      key: `tcg:${inv.id}`,
      source: 'tcg',
      category,
      id: inv.id,
      code: def.code,
      name: def.name,
      rarity: def.rarity,
      description: def.description,
      quantity: inv.quantity,
      level: inv.enhancementLevel,
      perks: def.battlePerks ?? [],
      slot: inv.state === 'EQUIPPED' ? inv.slot : undefined,
      wornBy:
        inv.state === 'EQUIPPED' && inv.equippedToCardId
          ? wearerNames.get(inv.equippedToCardId)
          : undefined,
      stackable: def.type === 'CONSUMABLE' || def.type === 'MATERIAL',
      canUse: isEnergy,
      canEnhance: def.type === 'EQUIPMENT' || def.type === 'ACCESSORY',
      hint: category === 'POTIONS' ? 'HP and mana potions are used in battle.' : undefined,
    });
  }

  const bag = await services.inventoryService.getUserInventory(userId);
  for (const slot of bag) {
    const metadata = (slot.item?.metadata ?? {}) as Record<string, unknown>;
    const itemType = typeof metadata['itemType'] === 'string' ? metadata['itemType'] : 'GENERIC';
    const isVoucher = itemType === 'PROFILE_BG_TOKEN';
    entries.push({
      key: `bag:${slot.itemId}`,
      source: 'bag',
      category: itemType === 'ENERGY_RESTORE' ? 'ENERGY' : 'BAG',
      id: slot.itemId,
      code: slot.item?.code ?? slot.itemId,
      name: slot.item?.name ?? slot.itemId,
      rarity: slot.item?.rarity ?? 'COMMON',
      description: slot.item?.description ?? 'No description',
      quantity: slot.quantity,
      level: 0,
      perks: [],
      stackable: true,
      canUse: BAG_USABLE_TYPES.has(itemType),
      canEnhance: false,
      hint: isVoucher ? 'Redeem this voucher with `/profile background`.' : undefined,
    });
  }

  return entries;
}

/** Reads the energy, daily potion and Crafting Dust figures of the overview. Each figure that
 *  cannot be read is left out, so the view still opens. */
export async function loadItemsOverview(
  services: BotServices,
  userId: string,
): Promise<ItemsOverview> {
  const overview: ItemsOverview = {};
  try {
    const lifecycle = services.energyLifecycleService;
    const energy = await lifecycle.getOrReconcileUserEnergy(userId);
    const rules = await lifecycle.rules();
    overview.energy = {
      current: energy.currentEnergy,
      max: energy.maxEnergy,
      bonus: energy.bonusEnergy,
    };
    overview.potionsUsed = energy.dailyEnergyPotsUsed;
    overview.potionLimit = rules.dailyPotionLimit;
  } catch {
    // The energy lines are left out.
  }
  try {
    overview.dust = await services.enhancementService.getDustBalance(userId);
  } catch {
    // The dust line is left out.
  }
  return overview;
}

export function entriesInCategory(
  entries: readonly ItemEntry[],
  category: ItemCategory,
): ItemEntry[] {
  return category === 'OVERVIEW' ? [] : entries.filter((e) => e.category === category);
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / ITEMS_PAGE_SIZE));
}

/** The entry the view highlights: the selected one when it is in the category, else the first on
 *  the current page. */
export function selectedEntry(state: ItemsViewState): ItemEntry | undefined {
  const inCategory = entriesInCategory(state.entries, state.category);
  const page = Math.min(Math.max(0, state.page), pageCount(inCategory.length) - 1);
  return inCategory.find((e) => e.key === state.selectedKey) ?? inCategory[page * ITEMS_PAGE_SIZE];
}

function entryLine(entry: ItemEntry, marked: boolean): string {
  const level = entry.canEnhance && entry.level > 0 ? ` **+${entry.level}**` : '';
  const qty = entry.stackable ? ` (x${entry.quantity})` : '';
  const worn =
    entry.slot && entry.slot !== 'NONE'
      ? ` \`[EQUIPPED: ${entry.slot} on ${entry.wornBy ?? 'unknown card'}]\``
      : '';
  return `${marked ? '👉' : '•'} **${truncate(entry.name, 60)}**${level}${qty}${worn} — [${entry.rarity}]`;
}

function entryDetails(entry: ItemEntry): string {
  const lines = [
    `🎯 **${entry.name}** [${entry.rarity}]` +
      (entry.stackable ? ` (Quantity: ${entry.quantity})` : ` (Enhancement: +${entry.level})`),
    `*${truncate(entry.description, 300)}*`,
    `${entry.source === 'tcg' ? 'ID' : 'Code'}: \`${entry.source === 'tcg' ? entry.id : entry.code}\`` +
      (entry.source === 'tcg' ? ` · Code: \`${entry.code}\`` : ''),
  ];
  if (entry.perks.length > 0) lines.push(`Perk: ${entry.perks.join(', ')}`);
  if (entry.wornBy) lines.push(`Worn by: ${entry.wornBy}`);
  if (entry.hint) lines.push(`ℹ️ ${entry.hint}`);
  return lines.join('\n');
}

function overviewLines(state: ItemsViewState): string[] {
  const { overview } = state;
  const lines: string[] = [];
  if (overview.energy) {
    lines.push(
      `⚡ **Energy**: \`${overview.energy.current}/${overview.energy.max + overview.energy.bonus}\``,
    );
  }
  if (overview.potionsUsed !== undefined && overview.potionLimit !== undefined) {
    lines.push(`🧪 **Energy potions today**: \`${overview.potionsUsed}/${overview.potionLimit}\``);
  }
  if (overview.dust !== undefined) {
    lines.push(`🔨 **Crafting Dust**: \`${overview.dust}\``);
  }
  lines.push('', '**Items per category**');
  for (const category of ITEM_CATEGORIES) {
    if (category === 'OVERVIEW') continue;
    const { label, icon } = CATEGORY_LABELS[category];
    lines.push(`${icon} ${label}: \`${entriesInCategory(state.entries, category).length}\``);
  }
  return lines;
}

/** Builds the embed and the component rows of the `/items` view. */
export function buildItemsView(state: ItemsViewState): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
} {
  const inCategory = entriesInCategory(state.entries, state.category);
  const pages = pageCount(inCategory.length);
  const page = Math.min(Math.max(0, state.page), pages - 1);
  const pageEntries = inCategory.slice(page * ITEMS_PAGE_SIZE, (page + 1) * ITEMS_PAGE_SIZE);
  const selected = selectedEntry({ ...state, page });
  const { label, icon } = CATEGORY_LABELS[state.category];

  let body: string;
  if (state.category === 'OVERVIEW') {
    body = overviewLines(state).join('\n');
  } else if (inCategory.length === 0) {
    body = `Nothing here yet. Visit \`/shop\` or explore dungeons to find ${label.toLowerCase()}.`;
  } else {
    const lines = pageEntries.map((e) => entryLine(e, e.key === selected?.key));
    const shown: string[] = [];
    let chars = 0;
    for (const line of lines) {
      if (shown.length > 0 && chars + line.length > LIST_CHAR_BUDGET) break;
      shown.push(line);
      chars += line.length + 1;
    }
    const hidden = lines.length - shown.length;
    body =
      shown.join('\n') +
      (hidden > 0 ? `\n*${hidden} more on this page. Pick them in the item menu.*` : '') +
      (selected ? `\n\n${entryDetails(selected)}` : '');
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(
      `${icon} ${state.ownerName}'s Items · ${label}` +
        (state.category !== 'OVERVIEW' ? ` (${inCategory.length})` : ''),
    )
    .setDescription((state.notice ? `${state.notice}\n\n` : '') + body)
    .setFooter({
      text:
        state.category !== 'OVERVIEW' && pages > 1
          ? `Page ${page + 1}/${pages} · pick a category or an item below`
          : 'Pick a category or an item below',
    });

  const categoryMenu = new StringSelectMenuBuilder()
    .setCustomId(ITEM_CUSTOM_IDS.category)
    .setPlaceholder('Choose a category...')
    .addOptions(
      ITEM_CATEGORIES.map((category) => {
        const meta = CATEGORY_LABELS[category];
        return {
          label: meta.label,
          value: category,
          description:
            category === 'OVERVIEW'
              ? 'Energy, potions used and Crafting Dust'
              : `${entriesInCategory(state.entries, category).length} item(s)`,
          emoji: meta.icon,
          default: category === state.category,
        };
      }),
    )
    .setDisabled(state.disabled === true);
  const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [
    new ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>().addComponents(categoryMenu),
  ];

  if (pageEntries.length > 0) {
    const itemMenu = new StringSelectMenuBuilder()
      .setCustomId(ITEM_CUSTOM_IDS.item)
      .setPlaceholder(selected ? truncate(`Selected: ${selected.name}`, 100) : 'Select an item...')
      .addOptions(
        pageEntries.map((e) => ({
          label: truncate(
            `${e.name}${e.stackable ? ` (x${e.quantity})` : e.level > 0 ? ` (+${e.level})` : ''}`,
            100,
          ),
          value: e.key,
          description: truncate(e.description || `${e.rarity} item`, 100),
          default: e.key === selected?.key,
        })),
      )
      .setDisabled(state.disabled === true);
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>().addComponents(itemMenu),
    );
  }

  const buttons: ButtonBuilder[] = [];
  if (state.category !== 'OVERVIEW' && pages > 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(ITEM_CUSTOM_IDS.prev)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(state.disabled === true || page === 0),
      new ButtonBuilder()
        .setCustomId(ITEM_CUSTOM_IDS.next)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(state.disabled === true || page >= pages - 1),
    );
  }
  if (!state.readOnly) {
    if (selected?.canUse) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(ITEM_CUSTOM_IDS.use)
          .setLabel('Use')
          .setEmoji('🧪')
          .setStyle(ButtonStyle.Success)
          .setDisabled(state.disabled === true),
      );
    }
    if (selected?.canEnhance) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(ITEM_CUSTOM_IDS.enhance)
          .setLabel('Enhance +1')
          .setEmoji('⚡')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(state.disabled === true),
      );
    }
    buttons.push(
      new ButtonBuilder()
        .setCustomId(ITEM_CUSTOM_IDS.craft)
        .setLabel('Craft')
        .setEmoji('🔨')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(state.disabled === true),
    );
  }
  if (buttons.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>().addComponents(buttons),
    );
  }

  return { embed, components: rows };
}
