import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type Message,
} from 'discord.js';
import type { CommandContext } from '@ririko/discord';
import type { EquipmentStats, GearSlot } from '@ririko/services';
import type { GameItem } from '@ririko/database';
import type { BotServices } from '../../services.js';
import { formatStatDelta } from './gear-menu.js';

export type ShopCategory = 'ALL' | 'EQUIPMENT' | 'ACCESSORY' | 'CONSUMABLE' | 'DAILY';

const CATEGORY_LABELS: Record<ShopCategory, string> = {
  ALL: '🏪 All',
  EQUIPMENT: '⚔️ Gear',
  ACCESSORY: '💍 Accessories',
  CONSUMABLE: '🧪 Potions',
  DAILY: '🌅 Daily Deals',
};

const GEAR_TYPES = new Set(['EQUIPMENT', 'ACCESSORY']);

export interface ShopMenuState {
  category: ShopCategory;
  items: GameItem[];
  selectedIndex: number;
  /** Stats of the item in the same slot on the equipped card (gear only). */
  equippedStats?: EquipmentStats | undefined;
  equippedName?: string | undefined;
  vanguardName?: string | undefined;
  notice?: string | undefined;
}

function itemIcon(item: GameItem): string {
  if (item.subtype === 'HP_POTION') return '🧪';
  if (item.subtype === 'MANA_POTION') return '🔷';
  if (item.subtype === 'ENERGY_POTION') return '⚡';
  return item.type === 'ACCESSORY' ? '💍' : '⚔️';
}

/** Embed and components for the Town Shop. Pure: no I/O. */
export function buildShopView(state: ShopMenuState): {
  embed: EmbedBuilder;
  components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>>;
} {
  const selected = state.items[state.selectedIndex];
  const isGear = selected ? GEAR_TYPES.has(selected.type) : false;

  const lines = state.items.slice(0, 25).map((item, idx) => {
    const marker = idx === state.selectedIndex ? '👉 ' : '• ';
    const limit = item.maxDailyPurchases > 0 ? ` (Limit: ${item.maxDailyPurchases}/day)` : '';
    return `${marker}${itemIcon(item)} **${item.name}** — 🪙 **${item.shopPrice.toLocaleString()} credits** [${item.rarity}]${limit}`;
  });

  let detail = '';
  if (selected) {
    detail = `\n\n🎯 **${selected.name}** — *${selected.description}*`;
    if (isGear) {
      const stats = (selected.baseStats ?? {}) as EquipmentStats;
      const target = state.vanguardName ? ` on **${state.vanguardName}**` : '';
      detail +=
        `\nCompared with your ${selected.subtype.toLowerCase()}${target}` +
        `${state.equippedName ? ` (${state.equippedName})` : ' (empty slot)'}: ` +
        formatStatDelta(stats, state.equippedStats);
      if (selected.battlePerks?.length) detail += `\n🔥 Perk: ${selected.battlePerks.join(', ')}`;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🏪 Town Item Shop Catalog — ${CATEGORY_LABELS[state.category]}`)
    .setDescription(
      (state.notice ? `${state.notice}\n\n` : '') +
        (state.category === 'DAILY'
          ? '🌅 Drop-only gear, on sale today only (resets 00:00 UTC).\n\n'
          : '') +
        (lines.length > 0 ? lines.join('\n') : '*Nothing in stock in this category.*') +
        detail,
    )
    .setFooter({ text: 'Double-entry ledger audited | Pick an item, then buy with the buttons' });

  const categoryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    (Object.keys(CATEGORY_LABELS) as ShopCategory[]).map((cat) =>
      new ButtonBuilder()
        .setCustomId(`shop:cat:${cat}`)
        .setLabel(CATEGORY_LABELS[cat])
        .setStyle(cat === state.category ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  );
  const rows: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [
    categoryRow,
  ];

  if (state.items.length > 0 && selected) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('shop:select_item')
          .setPlaceholder('Choose an item')
          .addOptions(
            state.items.slice(0, 25).map((item, idx) => ({
              label: `${itemIcon(item)} ${item.name} — ${item.shopPrice}c`.slice(0, 100),
              description: (item.description || `${item.type} item`).slice(0, 100),
              value: String(idx),
              default: idx === state.selectedIndex,
            })),
          ),
      ),
    );

    const maxQty = selected.maxDailyPurchases > 0 ? selected.maxDailyPurchases : Infinity;
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('shop:buy:1')
          .setLabel(`🛍️ Buy 1x (${selected.shopPrice}c)`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('shop:buy:5')
          .setLabel(`🛍️ Buy 5x (${selected.shopPrice * 5}c)`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(isGear || maxQty < 5),
        new ButtonBuilder()
          .setCustomId('shop:buy_equip')
          .setLabel('⚔️ Buy & Equip')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!isGear || !state.vanguardName),
      ),
    );
  }

  return { embed, components: rows };
}

async function loadItems(services: BotServices, category: ShopCategory): Promise<GameItem[]> {
  if (category === 'DAILY') return services.tcgShopService.getDailyRotation();
  return services.tcgShopService.getCatalog(category === 'ALL' ? undefined : category);
}

/** Fills in the equipped card's matching gear for the selected shop item. */
async function withComparison(
  services: BotServices,
  userId: string,
  state: ShopMenuState,
): Promise<{ state: ShopMenuState; vanguardId?: string | undefined }> {
  const selected = state.items[state.selectedIndex];
  const base = {
    ...state,
    equippedStats: undefined,
    equippedName: undefined,
    vanguardName: undefined,
  };
  if (!selected || !GEAR_TYPES.has(selected.type)) return { state: base };
  try {
    const [vanguard] = await services.waifuCardRepo.listUserCards(userId, { state: 'EQUIPPED' });
    if (!vanguard) return { state: base };
    const card = await services.waifuCardRepo.findById(vanguard.cardId);
    const loadout = await services.loadoutService.getCardLoadout(vanguard.id);
    const piece = loadout[selected.subtype.toLowerCase() as Lowercase<GearSlot>];
    return {
      vanguardId: vanguard.id,
      state: {
        ...base,
        vanguardName: card?.name ?? 'your card',
        equippedStats: piece?.effectiveStats,
        equippedName: piece?.item.name,
      },
    };
  } catch {
    return { state: base };
  }
}

/** Opens the interactive Town Shop: category buttons, item dropdown, compare, buy and Buy & Equip. */
export async function openShopMenu(
  ctx: CommandContext,
  services: BotServices,
  initialCategory?: string | undefined,
): Promise<void> {
  const userId = ctx.user.id;
  const category: ShopCategory =
    initialCategory && initialCategory.toUpperCase() in CATEGORY_LABELS
      ? (initialCategory.toUpperCase() as ShopCategory)
      : 'ALL';

  let items = await loadItems(services, category);
  if (items.length === 0 && category === 'ALL') {
    await ctx.reply({ content: '🛒 The Town Item Shop is currently restocked or closed.' });
    return;
  }

  let { state, vanguardId } = await withComparison(services, userId, {
    category,
    items,
    selectedIndex: 0,
  });
  const initial = buildShopView(state);
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
      await interaction.reply({ content: '⏳ This is not your shop menu!', ephemeral: true });
      return;
    }

    let notice: string | undefined;
    let next: ShopMenuState = { ...state, notice: undefined };
    try {
      if (interaction.isButton() && interaction.customId.startsWith('shop:cat:')) {
        const cat = interaction.customId.split(':')[2] as ShopCategory;
        items = await loadItems(services, cat);
        next = { category: cat, items, selectedIndex: 0 };
      } else if (interaction.isStringSelectMenu() && interaction.customId === 'shop:select_item') {
        const idx = Number.parseInt(interaction.values[0] ?? '0', 10);
        if (idx >= 0 && idx < state.items.length) next.selectedIndex = idx;
      } else if (interaction.isButton()) {
        const selected = state.items[state.selectedIndex];
        if (selected && interaction.customId.startsWith('shop:buy:')) {
          const qty = Number.parseInt(interaction.customId.split(':')[2] ?? '1', 10);
          const receipt = await services.tcgShopService.buyItem(
            userId,
            selected.code,
            qty,
            ctx.guild?.id,
          );
          notice = `✅ **Purchased ${receipt.quantity}x ${receipt.item.name}** for **${receipt.totalPrice.toLocaleString()} credits**! (Wallet: \`${receipt.walletBalanceAfter.toLocaleString()}\`)`;
        } else if (selected && interaction.customId === 'shop:buy_equip' && vanguardId) {
          const receipt = await services.tcgShopService.buyItem(
            userId,
            selected.code,
            1,
            ctx.guild?.id,
          );
          const newItemId = receipt.inventoryItemIds[0];
          if (!newItemId) throw new Error('Purchased item was not delivered to your inventory.');
          const equipped = await services.loadoutService.equip(
            userId,
            vanguardId,
            newItemId,
            selected.subtype as GearSlot,
          );
          notice =
            `✅ **Bought & equipped ${receipt.item.name}** on ${state.vanguardName} for **${receipt.totalPrice.toLocaleString()} credits**!` +
            (equipped.unequippedItemName
              ? ` (${equipped.unequippedItemName} returned to inventory)`
              : '');
        }
      }
    } catch (err: unknown) {
      notice = `❌ **Purchase Failed**: ${err instanceof Error ? err.message : String(err)}`;
    }

    ({ state, vanguardId } = await withComparison(services, userId, next));
    state.notice = notice;
    const view = buildShopView(state);
    await interaction.update({ embeds: [view.embed], components: view.components }).catch(() => {});
  });

  collector.on('end', async () => {
    await message.edit({ components: [] }).catch(() => {});
  });
}
