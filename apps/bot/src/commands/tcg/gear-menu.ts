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
  allCards?: GearCardOption[] | undefined;
  cardPage?: number | undefined;
  cards: GearCardOption[];
  cardId: string;
  cardLabel: string;
  loadout: CardLoadout;
  slot: GearSlot;
  allCandidates?: GearCandidate[] | undefined;
  candidatePage?: number | undefined;
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
  const allCards = state.allCards ?? state.cards;
  const cardPage = state.cardPage ?? 0;
  const allCandidates = state.allCandidates ?? state.candidates;
  const candidatePage = state.candidatePage ?? 0;

  const PAGE_SIZE = 25;
  const totalCardPages = Math.max(1, Math.ceil(allCards.length / PAGE_SIZE));
  const totalCandidatePages = Math.max(1, Math.ceil(allCandidates.length / PAGE_SIZE));

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

  let paginationNote = '';
  if (allCards.length > PAGE_SIZE || allCandidates.length > PAGE_SIZE) {
    const cardStart = cardPage * PAGE_SIZE + 1;
    const cardEnd = Math.min((cardPage + 1) * PAGE_SIZE, allCards.length);
    const candStart = candidatePage * PAGE_SIZE + 1;
    const candEnd = Math.min((candidatePage + 1) * PAGE_SIZE, allCandidates.length);
    paginationNote = `\n\n📄 **Collection**: Cards ${cardStart}–${cardEnd} of ${allCards.length} (Page ${cardPage + 1}/${totalCardPages})`;
    if (allCandidates.length > 0) {
      paginationNote += ` · Gear ${candStart}–${candEnd} of ${allCandidates.length} (Page ${candidatePage + 1}/${totalCandidatePages})`;
    }
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
        focus +
        paginationNote,
    )
    .setFooter({ text: `🧪 Crafting Dust: ${state.dust.toLocaleString()}` });

  const cardMenuPlaceholder =
    totalCardPages > 1
      ? `Choose a card (Page ${cardPage + 1}/${totalCardPages} · ${allCards.length} cards)`
      : 'Choose a card';

  const cardMenu = new StringSelectMenuBuilder()
    .setCustomId('gear:card')
    .setPlaceholder(cardMenuPlaceholder)
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
    const itemMenuPlaceholder =
      totalCandidatePages > 1
        ? `Choose gear to compare (Page ${candidatePage + 1}/${totalCandidatePages} · ${allCandidates.length} items)`
        : 'Choose gear to compare';

    const itemMenu = new StringSelectMenuBuilder()
      .setCustomId('gear:item')
      .setPlaceholder(itemMenuPlaceholder)
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
      new ButtonBuilder()
        .setCustomId('gear:unequip_all')
        .setLabel('Unequip All')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!ALL_GEAR_SLOTS.some((slot) => slotPiece(state.loadout, slot))),
      new ButtonBuilder().setCustomId('gear:close').setLabel('Close').setStyle(ButtonStyle.Danger),
    ),
  );

  // Pagination row if either cards or candidates exceed 25
  if (totalCardPages > 1 || totalCandidatePages > 1) {
    const pageButtons: ButtonBuilder[] = [];
    if (totalCardPages > 1 && totalCandidatePages > 1) {
      pageButtons.push(
        new ButtonBuilder()
          .setCustomId('gear:card_prev')
          .setLabel('◀ Card')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(cardPage === 0),
        new ButtonBuilder()
          .setCustomId('gear:card_next')
          .setLabel('Card ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(cardPage >= totalCardPages - 1),
        new ButtonBuilder()
          .setCustomId('gear:candidate_prev')
          .setLabel('◀ Gear')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(candidatePage === 0),
        new ButtonBuilder()
          .setCustomId('gear:candidate_next')
          .setLabel('Gear ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(candidatePage >= totalCandidatePages - 1),
      );
    } else if (totalCardPages > 1) {
      pageButtons.push(
        new ButtonBuilder()
          .setCustomId('gear:card_prev')
          .setLabel('◀ Prev Cards')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(cardPage === 0),
        new ButtonBuilder()
          .setCustomId('gear:card_page_info')
          .setLabel(`Cards ${cardPage + 1}/${totalCardPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('gear:card_next')
          .setLabel('Next Cards ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(cardPage >= totalCardPages - 1),
      );
    } else {
      pageButtons.push(
        new ButtonBuilder()
          .setCustomId('gear:candidate_prev')
          .setLabel('◀ Prev Gear')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(candidatePage === 0),
        new ButtonBuilder()
          .setCustomId('gear:candidate_page_info')
          .setLabel(`Gear ${candidatePage + 1}/${totalCandidatePages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('gear:candidate_next')
          .setLabel('Next Gear ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(candidatePage >= totalCandidatePages - 1),
      );
    }
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(pageButtons));
  }

  return { embed, components: rows };
}

/** Loads everything the menu shows for one card and slot. */
export async function loadGearMenuState(
  services: BotServices,
  userId: string,
  targetCardId?: string | undefined,
  slot: GearSlot = 'WEAPON',
  selectedItemId?: string | undefined,
  requestedCardPage?: number | undefined,
  requestedCandidatePage?: number | undefined,
): Promise<GearMenuState | null> {
  const userCards = await services.waifuCardRepo.listUserCards(userId);
  if (userCards.length === 0) return null;

  const allCards: GearCardOption[] = [];
  for (const uc of userCards) {
    const base = await services.waifuCardRepo.findById(uc.cardId);
    const equippedTag = uc.state === 'EQUIPPED' ? ' ⭐' : '';
    allCards.push({
      userCardId: uc.id,
      label: `${base?.name ?? 'Card'} Lv.${uc.level} [${base?.element ?? '?'}]${equippedTag}`,
    });
  }

  let targetIndex = targetCardId ? allCards.findIndex((c) => c.userCardId === targetCardId) : -1;
  if (targetIndex === -1) {
    const equippedIndex = allCards.findIndex((c) => c.label.includes('⭐'));
    targetIndex = equippedIndex !== -1 ? equippedIndex : 0;
  }
  const current = allCards[targetIndex]!;

  const PAGE_SIZE = 25;
  const totalCardPages = Math.max(1, Math.ceil(allCards.length / PAGE_SIZE));
  let cardPage =
    requestedCardPage !== undefined ? requestedCardPage : Math.floor(targetIndex / PAGE_SIZE);
  cardPage = Math.max(0, Math.min(cardPage, totalCardPages - 1));
  const cards = allCards.slice(cardPage * PAGE_SIZE, (cardPage + 1) * PAGE_SIZE);

  const loadout = await services.loadoutService.getCardLoadout(current.userCardId);
  const idle = await services.userInventoryItemRepo.findByUser(userId, { state: 'IDLE' });
  const allCandidates: GearCandidate[] = [];
  for (const inv of idle) {
    const item = await services.gameItemRepo.findById(inv.itemId);
    if (!item || item.subtype !== slot) continue;
    allCandidates.push({
      inventoryItem: inv,
      item,
      stats: services.enhancementService.getScaledStats(item.baseStats, inv.enhancementLevel),
    });
  }

  const totalCandidatePages = Math.max(1, Math.ceil(allCandidates.length / PAGE_SIZE));
  let candidatePage = requestedCandidatePage ?? 0;
  if (selectedItemId) {
    const selIdx = allCandidates.findIndex((c) => c.inventoryItem.id === selectedItemId);
    if (selIdx !== -1) {
      candidatePage = Math.floor(selIdx / PAGE_SIZE);
    }
  }
  candidatePage = Math.max(0, Math.min(candidatePage, totalCandidatePages - 1));
  const candidates = allCandidates.slice(
    candidatePage * PAGE_SIZE,
    (candidatePage + 1) * PAGE_SIZE,
  );

  const equipped = slotPiece(loadout, slot);
  const level = equipped?.inventoryItem.enhancementLevel ?? 0;
  const enhanceCost =
    equipped && level < 10
      ? services.enhancementService.getEnhancementCost(equipped.item.rarity, level)
      : undefined;

  return {
    allCards,
    cardPage,
    cards,
    cardId: current.userCardId,
    cardLabel: current.label,
    loadout,
    slot,
    allCandidates,
    candidatePage,
    candidates,
    selectedItemId: allCandidates.some((c) => c.inventoryItem.id === selectedItemId)
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
    let nextCard = state.cardId;
    let nextSlot = state.slot;
    let nextItem = state.selectedItemId;
    let nextCardPage = state.cardPage ?? 0;
    let nextCandidatePage = state.candidatePage ?? 0;

    try {
      if (interaction.isStringSelectMenu()) {
        const value = interaction.values[0] ?? '';
        if (interaction.customId === 'gear:card') {
          nextCard = value;
          nextItem = undefined;
          nextCandidatePage = 0;
          const cardIdx = (state.allCards ?? state.cards).findIndex(
            (c) => c.userCardId === value,
          );
          if (cardIdx !== -1) nextCardPage = Math.floor(cardIdx / 25);
        } else if (interaction.customId === 'gear:slot') {
          nextSlot = value as GearSlot;
          nextItem = undefined;
          nextCandidatePage = 0;
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
        if (interaction.customId === 'gear:card_prev') {
          nextCardPage = Math.max(0, (state.cardPage ?? 0) - 1);
          nextCard = (state.allCards ?? state.cards)[nextCardPage * 25]?.userCardId ?? state.cardId;
        } else if (interaction.customId === 'gear:card_next') {
          const totalPages = Math.ceil(((state.allCards ?? state.cards).length) / 25);
          nextCardPage = Math.min(totalPages - 1, (state.cardPage ?? 0) + 1);
          nextCard = (state.allCards ?? state.cards)[nextCardPage * 25]?.userCardId ?? state.cardId;
        } else if (interaction.customId === 'gear:candidate_prev') {
          nextCandidatePage = Math.max(0, (state.candidatePage ?? 0) - 1);
        } else if (interaction.customId === 'gear:candidate_next') {
          const totalPages = Math.ceil(((state.allCandidates ?? state.candidates).length) / 25);
          nextCandidatePage = Math.min(totalPages - 1, (state.candidatePage ?? 0) + 1);
        } else if (interaction.customId === 'gear:equip' && state.selectedItemId) {
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
        } else if (interaction.customId === 'gear:unequip_all') {
          const result = await services.loadoutService.unequipAll(userId, state.cardId);
          notice = `🛡️ Unequipped ${result.unequippedItemNames.length} piece(s). This card is empty and can now be sold or traded.`;
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

    state =
      (await loadGearMenuState(
        services,
        userId,
        nextCard,
        nextSlot,
        nextItem,
        nextCardPage,
        nextCandidatePage,
      )) ?? state;
    state.notice = notice;
    const view = buildGearMenuView(state);
    await interaction.update({ embeds: [view.embed], components: view.components }).catch(() => {});
  });

  collector.on('end', async (_collected, reason) => {
    if (reason !== 'closed') await message.edit({ components: [] }).catch(() => {});
  });
}
