import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type Message,
} from 'discord.js';
import type { CommandContext } from '@ririko/discord';
import {
  ALL_GEAR_SLOTS,
  type CardLoadout,
  type EquipmentStats,
  type GearSlot,
  type UserInventoryItemWithDefinition,
} from '@ririko/services';
import type { GameItem, UserInventoryItem } from '@ririko/database';
import type { BotServices } from '../../services.js';
import { enhanceGear } from './gear-actions.js';

const SLOT_LABELS: Record<GearSlot, string> = {
  WEAPON: '⚔️ Weapon',
  ARMOR: '🛡️ Armor',
  RELIC: '🔮 Relic',
  RING: '💍 Ring',
  AMULET: '📿 Amulet',
  TALISMAN: '🪶 Talisman',
};

const STAT_LABELS: Record<string, string> = {
  attack: 'ATK',
  defense: 'DEF',
  health: 'HP',
  speed: 'SPD',
  critRate: 'CRIT',
  critDamage: 'CRIT DMG',
  mitigation: 'MIT',
  elementalMastery: 'MASTERY',
  manaShield: 'SHIELD',
  armorPiercing: 'PIERCE',
  elementalResistance: 'RES',
  manaMax: 'MAX MP',
  manaRegen: 'MP REGEN',
};

const PERCENT_STATS = new Set([
  'critRate',
  'critDamage',
  'mitigation',
  'elementalMastery',
  'armorPiercing',
  'elementalResistance',
  'manaRegen',
]);

function formatStatValue(key: string, value: number): string {
  return PERCENT_STATS.has(key) ? `${Math.round(value * 1000) / 10}%` : String(Math.round(value));
}

/** "ATK +40 ▲ · SPD -5 ▼": what swapping `current` for `candidate` changes. */
export function formatStatDelta(
  candidate: EquipmentStats,
  current: EquipmentStats | undefined,
): string {
  const keys = new Set([...Object.keys(candidate), ...Object.keys(current ?? {})]);
  const parts: string[] = [];
  for (const key of keys) {
    const next = (candidate as Record<string, number | undefined>)[key] ?? 0;
    const prev = ((current ?? {}) as Record<string, number | undefined>)[key] ?? 0;
    const diff = next - prev;
    if (Math.abs(diff) < 1e-9) continue;
    const label = STAT_LABELS[key] ?? key;
    const sign = diff > 0 ? '+' : '-';
    parts.push(`${label} ${sign}${formatStatValue(key, Math.abs(diff))} ${diff > 0 ? '▲' : '▼'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No stat change';
}

export function formatStats(stats: EquipmentStats): string {
  const parts = Object.entries(stats)
    .filter(([, v]) => typeof v === 'number' && v !== 0)
    .map(([k, v]) => `${STAT_LABELS[k] ?? k} +${formatStatValue(k, v as number)}`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export interface GearCardOption {
  userCardId: string;
  label: string;
}

export interface GearCandidate {
  inventoryItem: UserInventoryItem;
  item: GameItem;
  stats: EquipmentStats;
}

export interface GearMenuState {
  cards: GearCardOption[];
  cardId: string;
  cardLabel: string;
  loadout: CardLoadout;
  slot: GearSlot;
  candidates: GearCandidate[];
  selectedItemId?: string | undefined;
  enhanceCost?: { dustCost: number; creditCost: number } | undefined;
  dust: number;
  notice?: string | undefined;
}

function slotPiece(
  loadout: CardLoadout,
  slot: GearSlot,
): UserInventoryItemWithDefinition | undefined {
  return loadout[slot.toLowerCase() as Lowercase<GearSlot>];
}

/** Embed and components for the interactive gear menu. Pure: no I/O. */
export function buildGearMenuView(state: GearMenuState): {
  embed: EmbedBuilder;
  components: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>>;
} {
  const equipped = slotPiece(state.loadout, state.slot);
  const selected = state.candidates.find((c) => c.inventoryItem.id === state.selectedItemId);

  const slotLines = ALL_GEAR_SLOTS.map((slot) => {
    const piece = slotPiece(state.loadout, slot);
    const marker = slot === state.slot ? '👉 ' : '';
    if (!piece) return `${marker}**${SLOT_LABELS[slot]}**: *empty*`;
    const plus =
      piece.inventoryItem.enhancementLevel > 0 ? ` +${piece.inventoryItem.enhancementLevel}` : '';
    return `${marker}**${SLOT_LABELS[slot]}**: ${piece.item.name}${plus} [${piece.item.rarity}]`;
  });

  let focus = `\n\n🎯 **${SLOT_LABELS[state.slot]}**`;
  if (equipped)
    focus += `\nEquipped: **${equipped.item.name}** — ${formatStats(equipped.effectiveStats)}`;
  if (selected) {
    focus +=
      `\nSelected: **${selected.item.name}** — ${formatStats(selected.stats)}` +
      `\nChange: ${formatStatDelta(selected.stats, equipped?.effectiveStats)}`;
  } else if (state.candidates.length === 0) {
    focus += '\n*You own no spare gear for this slot. Clear dungeon floors or visit the shop.*';
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`⚔️ Gear: ${state.cardLabel}`)
    .setDescription(
      (state.notice ? `${state.notice}\n\n` : '') +
        slotLines.join('\n') +
        `\n\n📈 **Total gear bonus**: ${formatStats(state.loadout.aggregateStats)}` +
        (state.loadout.activePerks.length
          ? `\n🔥 **Perks**: ${state.loadout.activePerks.join(', ')}`
          : '') +
        focus,
    )
    .setFooter({ text: `🧪 Crafting Dust: ${state.dust.toLocaleString()}` });

  const cardMenu = new StringSelectMenuBuilder()
    .setCustomId('gear:card')
    .setPlaceholder('Choose a card')
    .addOptions(
      state.cards.slice(0, 25).map((c) => ({
        label: c.label.slice(0, 100),
        value: c.userCardId,
        default: c.userCardId === state.cardId,
      })),
    );

  const slotMenu = new StringSelectMenuBuilder()
    .setCustomId('gear:slot')
    .setPlaceholder('Choose a slot')
    .addOptions(
      ALL_GEAR_SLOTS.map((slot) => ({
        label: SLOT_LABELS[slot],
        value: slot,
        description: (slotPiece(state.loadout, slot)?.item.name ?? 'Empty').slice(0, 100),
        default: slot === state.slot,
      })),
    );

  const rows: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(cardMenu),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(slotMenu),
  ];

  if (state.candidates.length > 0) {
    const itemMenu = new StringSelectMenuBuilder()
      .setCustomId('gear:item')
      .setPlaceholder('Choose gear to compare')
      .addOptions(
        state.candidates.slice(0, 25).map((c) => ({
          label:
            `${c.item.name}${c.inventoryItem.enhancementLevel > 0 ? ` +${c.inventoryItem.enhancementLevel}` : ''} [${c.item.rarity}]`.slice(
              0,
              100,
            ),
          value: c.inventoryItem.id,
          description: formatStatDelta(c.stats, equipped?.effectiveStats).slice(0, 100),
          default: c.inventoryItem.id === state.selectedItemId,
        })),
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(itemMenu));
  }

  const enhanceLabel =
    equipped && state.enhanceCost
      ? `Enhance (${state.enhanceCost.dustCost} dust, ${state.enhanceCost.creditCost}c)`
      : 'Enhance';
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('gear:equip')
        .setLabel('Equip')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!selected),
      new ButtonBuilder()
        .setCustomId('gear:unequip')
        .setLabel('Unequip')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!equipped),
      new ButtonBuilder()
        .setCustomId('gear:enhance')
        .setLabel(enhanceLabel)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!equipped || !state.enhanceCost),
      new ButtonBuilder().setCustomId('gear:close').setLabel('Close').setStyle(ButtonStyle.Danger),
    ),
  );

  return { embed, components: rows };
}

/** Loads everything the menu shows for one card and slot. */
export async function loadGearMenuState(
  services: BotServices,
  userId: string,
  cardId: string,
  slot: GearSlot,
  selectedItemId?: string | undefined,
): Promise<GearMenuState | null> {
  const userCards = await services.waifuCardRepo.listUserCards(userId);
  if (userCards.length === 0) return null;

  const cards: GearCardOption[] = [];
  for (const uc of userCards.slice(0, 25)) {
    const base = await services.waifuCardRepo.findById(uc.cardId);
    const equippedTag = uc.state === 'EQUIPPED' ? ' ⭐' : '';
    cards.push({
      userCardId: uc.id,
      label: `${base?.name ?? 'Card'} Lv.${uc.level} [${base?.element ?? '?'}]${equippedTag}`,
    });
  }
  const current = cards.find((c) => c.userCardId === cardId) ?? cards[0]!;

  const loadout = await services.loadoutService.getCardLoadout(current.userCardId);
  const idle = await services.userInventoryItemRepo.findByUser(userId, { state: 'IDLE' });
  const candidates: GearCandidate[] = [];
  for (const inv of idle) {
    const item = await services.gameItemRepo.findById(inv.itemId);
    if (!item || item.subtype !== slot) continue;
    candidates.push({
      inventoryItem: inv,
      item,
      stats: services.enhancementService.getScaledStats(item.baseStats, inv.enhancementLevel),
    });
  }

  const equipped = slotPiece(loadout, slot);
  const level = equipped?.inventoryItem.enhancementLevel ?? 0;
  const enhanceCost =
    equipped && level < 10
      ? services.enhancementService.getEnhancementCost(equipped.item.rarity, level)
      : undefined;

  return {
    cards,
    cardId: current.userCardId,
    cardLabel: current.label,
    loadout,
    slot,
    candidates,
    selectedItemId: candidates.some((c) => c.inventoryItem.id === selectedItemId)
      ? selectedItemId
      : undefined,
    enhanceCost,
    dust: await services.enhancementService.getDustBalance(userId),
  };
}

/** Opens the interactive gear menu (card, slot and item dropdowns with Equip / Unequip / Enhance). */
export async function openGearMenu(
  ctx: CommandContext,
  services: BotServices,
  cardId?: string | undefined,
): Promise<void> {
  const userId = ctx.user.id;
  let targetCardId = cardId;
  if (!targetCardId) {
    const equipped = await services.waifuCardRepo.listUserCards(userId, { state: 'EQUIPPED' });
    targetCardId = equipped[0]?.id;
  }

  let state = await loadGearMenuState(services, userId, targetCardId ?? '', 'WEAPON');
  if (!state) {
    await ctx.reply({ content: '❌ You have no cards yet. Claim a card first!', ephemeral: true });
    return;
  }

  const initial = buildGearMenuView(state);
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
        content: '⏳ This gear menu belongs to someone else.',
        ephemeral: true,
      });
      return;
    }
    if (!state) return;

    let notice: string | undefined;
    let { cardId: nextCard, slot: nextSlot, selectedItemId: nextItem } = state;

    try {
      if (interaction.isStringSelectMenu()) {
        const value = interaction.values[0] ?? '';
        if (interaction.customId === 'gear:card') {
          nextCard = value;
          nextItem = undefined;
        } else if (interaction.customId === 'gear:slot') {
          nextSlot = value as GearSlot;
          nextItem = undefined;
        } else if (interaction.customId === 'gear:item') {
          nextItem = value;
        }
      } else if (interaction.isButton()) {
        const equipped = slotPiece(state.loadout, state.slot);
        if (interaction.customId === 'gear:close') {
          collector.stop('closed');
          await interaction.update({ components: [] }).catch(() => {});
          return;
        }
        if (interaction.customId === 'gear:equip' && state.selectedItemId) {
          const result = await services.loadoutService.equip(
            userId,
            state.cardId,
            state.selectedItemId,
            state.slot,
          );
          notice = `✅ Equipped!${result.unequippedItemName ? ` (${result.unequippedItemName} returned to inventory)` : ''}`;
          nextItem = undefined;
        } else if (interaction.customId === 'gear:unequip' && equipped) {
          const result = await services.loadoutService.unequip(userId, equipped.inventoryItem.id);
          notice = `🛡️ Unequipped **${result.unequippedItemName}**.`;
        } else if (interaction.customId === 'gear:enhance' && equipped) {
          const result = await enhanceGear(services, userId, equipped.inventoryItem.id, {
            guildId: ctx.guild?.id,
            itemCode: equipped.item.code,
          });
          notice = `✨ **${equipped.item.name}** +${result.previousLevel} ➜ **+${result.newLevel}** (−${result.dustSpent} dust, −${result.creditsSpent} credits)`;
        }
      }
    } catch (err: unknown) {
      notice = `❌ ${err instanceof Error ? err.message : String(err)}`;
    }

    state = (await loadGearMenuState(services, userId, nextCard, nextSlot, nextItem)) ?? state;
    state.notice = notice;
    const view = buildGearMenuView(state);
    await interaction.update({ embeds: [view.embed], components: view.components }).catch(() => {});
  });

  collector.on('end', async (_collected, reason) => {
    if (reason !== 'closed') await message.edit({ components: [] }).catch(() => {});
  });
}
