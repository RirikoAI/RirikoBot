import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type Message,
} from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';
import {
  formatCardEmbedFooter,
  getCardAttribution,
  RARITY_TIERS,
  formatCardSerialNumber,
  LevelingEngine,
  type CardRarity,
} from '@ririko/services';
import type { WaifuAsset, WaifuCard, UserCard } from '@ririko/database';

const CARD_IMAGE_NAME = 'card.png';
const PAGE_SIZE = 10;
const levelingEngine = new LevelingEngine();

/**
 * Creates an ASCII/Unicode progress bar.
 */
function renderProgressBar(
  current: number,
  max: number,
  length: number = 10,
  fillChar: string = '█',
  emptyChar: string = '░',
): string {
  if (max <= 0) return `[${emptyChar.repeat(length)}]`;
  const pct = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(pct * length);
  const empty = Math.max(0, length - filled);
  return `[${fillChar.repeat(filled)}${emptyChar.repeat(empty)}]`;
}

/**
 * Renders the full card PNG and attaches it to the embed.
 */
async function attachCardImage(
  services: BotServices,
  embed: EmbedBuilder,
  card: WaifuCard,
  asset: WaifuAsset | null,
  attributionText: string,
): Promise<Array<{ attachment: Buffer; name: string }>> {
  try {
    const totalCount =
      typeof services.waifuCardRepo.count === 'function'
        ? await services.waifuCardRepo.count()
        : 0;

    const png = await services.cardImageService.getCardImage(card, asset, {
      attributionText,
      maxCollectionNumber: totalCount,
    });
    embed.setImage(`attachment://${CARD_IMAGE_NAME}`);
    return [{ attachment: png, name: CARD_IMAGE_NAME }];
  } catch (err) {
    console.warn(`[cards] Failed to render card image for ${card.id}:`, err);
    return [];
  }
}

export interface PopulatedUserCard {
  userCard: UserCard;
  base: WaifuCard;
  asset: WaifuAsset | null;
}

/**
 * Builds the embed for the paginated collection list.
 */
export function buildCardListEmbed(
  username: string,
  cards: PopulatedUserCard[],
  page: number,
  totalPages: number,
  totalOwned: number,
  filter?: string,
): EmbedBuilder {
  const activeVanguard = cards.find((c) => c.userCard.state === 'EQUIPPED');
  const vanguardLine = activeVanguard
    ? `⚔️ **Active Vanguard**: **${activeVanguard.base.name}** (Lv.${activeVanguard.userCard.level}, \`${activeVanguard.base.rarity}\` | \`${activeVanguard.base.element}\`)`
    : `⚔️ **Active Vanguard**: *None equipped*`;

  const startIndex = (page - 1) * PAGE_SIZE;
  const pageCards = cards.slice(startIndex, startIndex + PAGE_SIZE);

  const lines = pageCards.map((item, idx) => {
    const num = startIndex + idx + 1;
    const fav = item.userCard.isFavorite ? '⭐ ' : '';
    const eq = item.userCard.state === 'EQUIPPED' ? '⚔️ ' : '';
    const serial = formatCardSerialNumber(item.userCard.serialNumber);
    const tier = RARITY_TIERS[(item.base.rarity as CardRarity) ?? 'COMMON'];
    const expReq = levelingEngine.getExpForNextLevel(item.userCard.level);
    const battles = item.userCard.battlesWon ?? 0;

    return (
      `\`${num}.\` ${eq}${fav}**${item.base.name}** (\`${item.base.rarity}\` | \`${item.base.element}\`) — **Lv.${item.userCard.level}** \`[${serial}]\`\n` +
      `   └ 🏆 **${battles}** Wins | ⚡ **${item.userCard.exp}/${expReq}** EXP | State: \`${item.userCard.state}\``
    );
  });

  const filterText = filter ? ` • Filter: \`${filter}\`` : '';

  return new EmbedBuilder()
    .setTitle(`🎴 ${username}'s Waifu Card Album (Page ${page}/${totalPages})`)
    .setColor(0xff69b4)
    .setDescription(
      `${vanguardLine}\n\n` +
        (lines.length > 0 ? lines.join('\n\n') : '*No cards match the specified filter.*'),
    )
    .setFooter({
      text: `Page ${page} of ${totalPages} • Total Owned: ${totalOwned}${filterText} • Select a card below to inspect & equip!`,
    });
}

/**
 * Builds the interactive components (select menu + pagination buttons) for the collection list.
 */
export function buildCardListComponents(
  cards: PopulatedUserCard[],
  page: number,
  totalPages: number,
): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageCards = cards.slice(startIndex, startIndex + PAGE_SIZE);

  const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

  // 1. Dropdown select menu to inspect any card on this page
  if (pageCards.length > 0) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('cards:select')
      .setPlaceholder('🔍 Select a card to inspect full stats, gear & equip...')
      .addOptions(
        pageCards.map((item, idx) => {
          const num = startIndex + idx + 1;
          const eq = item.userCard.state === 'EQUIPPED' ? '⚔️ ' : '';
          const fav = item.userCard.isFavorite ? '⭐ ' : '';
          const serial = formatCardSerialNumber(item.userCard.serialNumber);
          const battles = item.userCard.battlesWon ?? 0;

          return {
            label: `${num}. ${eq}${fav}${item.base.name} (Lv.${item.userCard.level})`.slice(0, 100),
            description: `${item.base.rarity} | ${item.base.element} • ${battles} Wins • ${serial}`.slice(0, 100),
            value: `card:${item.userCard.id}`,
          };
        }),
      );

    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
  }

  // 2. Pagination buttons
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('cards:first')
      .setLabel('⏮️ First')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId('cards:prev')
      .setLabel('◀️ Prev')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId('cards:page_indicator')
      .setLabel(`${page} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('cards:next')
      .setLabel('Next ▶️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId('cards:last')
      .setLabel('Last ⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  );

  rows.push(buttonRow);
  return rows;
}

/**
 * Builds the detailed inspection embed for a single selected card.
 */
export async function buildCardInspectEmbed(
  services: BotServices,
  item: PopulatedUserCard,
): Promise<{ embed: EmbedBuilder; files: Array<{ attachment: Buffer; name: string }> }> {
  const { userCard, base, asset } = item;
  const tier = RARITY_TIERS[(base.rarity as CardRarity) ?? 'COMMON'];
  const formattedSerial = formatCardSerialNumber(userCard.serialNumber);

  const source = asset
    ? await services.waifuAssetRepo.findSourceById(asset.sourceId)
    : null;
  const footer = formatCardEmbedFooter(source, formattedSerial);

  // Scaled stats
  const scaled = levelingEngine.calculateScaledStats(
    {
      hp: base.health,
      attack: base.attack,
      defense: base.defense,
      speed: base.speed,
      critRate: base.critRate,
      mp: 100,
    },
    userCard.level,
  );

  const expRequired = levelingEngine.getExpForNextLevel(userCard.level);
  const isMax = userCard.level >= tier.maxLevel;
  const expBar = isMax
    ? renderProgressBar(1, 1, 10)
    : renderProgressBar(userCard.exp, expRequired, 10);
  const expText = isMax
    ? '`[██████████]` **MAX LEVEL**'
    : `\`${expBar}\` **${userCard.exp} / ${expRequired}** (${Math.round((userCard.exp / Math.max(1, expRequired)) * 100)}%)`;

  const battlesWon = userCard.battlesWon ?? 0;
  const isEquipped = userCard.state === 'EQUIPPED';

  // Loadout Gear if loadout service is available
  let loadoutText = '';
  if (services.loadoutService) {
    try {
      const loadout = await services.loadoutService.getCardLoadout(userCard.id);
      const renderPiece = (piece: typeof loadout.weapon, name: string) => {
        if (!piece) return `• **${name}**: *None*`;
        const enhance = piece.inventoryItem.enhancementLevel > 0 ? ` +${piece.inventoryItem.enhancementLevel}` : '';
        return `• **${name}**: **${piece.item.name}**${enhance}`;
      };
      loadoutText =
        `\n\n🛡️ **Equipped Combat Gear**\n` +
        `${renderPiece(loadout.weapon, 'Weapon')} | ${renderPiece(loadout.armor, 'Armor')} | ${renderPiece(loadout.relic, 'Relic')}\n` +
        `${renderPiece(loadout.ring, 'Ring')} | ${renderPiece(loadout.amulet, 'Amulet')} | ${renderPiece(loadout.talisman, 'Talisman')}`;

      if (loadout.activePerks.length > 0) {
        loadoutText += `\n🔥 **Active Perks**: ` + loadout.activePerks.map((p) => `\`${p}\``).join(', ');
      }
    } catch {
      // ignore
    }
  }

  // Color mapping
  const colorMap: Record<string, number> = {
    FIRE: 0xff4500,
    ICE: 0x00ffff,
    WATER: 0x1e90ff,
    LIGHTNING: 0xffd700,
    EARTH: 0x8b4513,
    LIGHT: 0xfffacd,
    SHADOW: 0x4b0082,
  };
  const embedColor = colorMap[base.element] ?? 0x9370db;

  const embed = new EmbedBuilder()
    .setTitle(
      `${isEquipped ? '⚔️ [EQUIPPED] ' : ''}${userCard.isFavorite ? '⭐ ' : ''}${base.name} (${formattedSerial})`,
    )
    .setColor(embedColor)
    .setDescription(
      `**Rarity**: \`${tier.name}\` (${tier.foilEffect}) • **Element**: \`${base.element}\`\n` +
        `**State**: \`${userCard.state}\` • **Favorite**: ${userCard.isFavorite ? '⭐ Yes' : 'No'}\n\n` +
        `📈 **Progression & Combat Record**\n` +
        `• **Level**: \`${userCard.level} / ${tier.maxLevel}\`\n` +
        `• **EXP**: ${expText}\n` +
        `• 🏆 **Battles Won**: **${battlesWon}** victories in Dungeons & Duels\n\n` +
        `📊 **Attributes (Scaled for Lv.${userCard.level})**\n` +
        `• **HP**: \`${scaled.hp.toLocaleString()}\` *(Base: ${base.health.toLocaleString()})*\n` +
        `• **ATK**: \`${scaled.attack}\` *(Base: ${base.attack})*\n` +
        `• **DEF**: \`${scaled.defense}\` *(Base: ${base.defense})*\n` +
        `• **SPD**: \`${scaled.speed}\` *(Base: ${base.speed})*\n` +
        `• **CRIT**: \`${(base.critRate * 100).toFixed(1)}%\`\n` +
        `• **MP**: \`100 / 100\`\n\n` +
        `⚔️ **Active Tactical Skill**\n` +
        `**${base.skillName ?? 'Tactical Strike'}** (Cost: 50 MP): ${base.skillDescription ?? 'Deals standard damage.'}\n\n` +
        `🛡️ **Passive Ability**\n` +
        `**${base.passiveName ?? 'Resilience'}**: ${base.passiveDescription ?? 'Standard combat passive.'}` +
        loadoutText,
    )
    .setFooter(footer);

  const files = await attachCardImage(
    services,
    embed,
    base,
    asset,
    getCardAttribution(source).footerText,
  );

  return { embed, files };
}

/**
 * Builds the interactive action buttons for card inspection (Equip, Favorite, Back).
 */
export function buildCardInspectComponents(
  userCard: UserCard,
): ActionRowBuilder<ButtonBuilder>[] {
  const isEquipped = userCard.state === 'EQUIPPED';
  const isLocked = userCard.state === 'IN_TRADE' || userCard.state === 'IN_MARKET';

  const row = new ActionRowBuilder<ButtonBuilder>();

  // Equip Button
  if (isEquipped) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cards:equip:${userCard.id}`)
        .setLabel('✅ Currently Equipped')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
    );
  } else if (isLocked) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cards:equip:${userCard.id}`)
        .setLabel(`🔒 Locked (${userCard.state})`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cards:equip:${userCard.id}`)
        .setLabel('⚔️ Equip Vanguard')
        .setStyle(ButtonStyle.Primary),
    );
  }

  // Favorite Button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`cards:fav:${userCard.id}`)
      .setLabel(userCard.isFavorite ? '⭐ Unfavorite' : '⭐ Favorite')
      .setStyle(ButtonStyle.Secondary),
  );

  // Back Button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('cards:back')
      .setLabel('◀️ Back to Cards List')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row];
}

/**
 * Creates the primary interactive `/cards` command.
 */
export function createCardsCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'cards',
      category: CommandCategory.TCG,
      description:
        'Interactive Waifu TCG card album with pagination, detailed inspection, and one-click equip menu.',
      aliases: ['album', 'mycards'],
      usage: '/cards [filter:FIRE|ICE|...] [sort:level|rarity|name|battles] [page]',
      examples: [
        '/cards',
        '/cards filter:ICE sort:level',
        '/cards sort:battles',
        '/cards page:2',
      ],
      options: [
        {
          name: 'filter',
          description: 'Filter cards by element (FIRE, ICE, etc.) or rarity',
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
          description: 'Sort cards by level, battles won, rarity, or name',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Battles Won (High to Low)', value: 'battles' },
            { name: 'Level (High to Low)', value: 'level' },
            { name: 'Rarity / ATK (High to Low)', value: 'rarity' },
            { name: 'Name (A to Z)', value: 'name' },
          ],
        },
        {
          name: 'page',
          description: 'Initial page number to open',
          type: 'INTEGER',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      await handleCardsCommand(ctx, services);
    },
  };
}

/**
 * Handles the full interactive card album flow (used by both `/cards` and `/card action:collection`).
 */
export async function handleCardsCommand(
  ctx: CommandContext,
  services: BotServices,
): Promise<void> {
  const filter = ctx.options.getString?.('filter')?.toUpperCase();
  const sort = ctx.options.getString?.('sort') ?? 'rarity';
  let currentPage = Math.max(1, ctx.options.getInteger?.('page') ?? 1);

  // 1. Fetch user cards
  const userCards = await services.waifuCardRepo.listUserCards(ctx.user.id, { limit: 200 });
  if (userCards.length === 0) {
    await ctx.reply({
      content:
        '📭 Your card album is currently empty! Watch out for automated card drops in chat or run `/dungeon tutorial` to claim your starter waifu!',
      ephemeral: true,
    });
    return;
  }

  // 2. Populate base card and asset metadata
  const populated: PopulatedUserCard[] = [];
  for (const uc of userCards) {
    const base = await services.waifuCardRepo.findById(uc.cardId);
    if (!base) continue;
    const asset = base.assetId && services.waifuAssetRepo
      ? await services.waifuAssetRepo.findById(base.assetId)
      : null;
    populated.push({ userCard: uc, base, asset });
  }

  // 3. Filter
  let filtered = populated;
  if (filter) {
    filtered = filtered.filter(
      (item) => item.base.element === filter || item.base.rarity === filter,
    );
  }

  // 4. Sort
  filtered.sort((a, b) => {
    if (sort === 'battles') {
      return (b.userCard.battlesWon ?? 0) - (a.userCard.battlesWon ?? 0);
    }
    if (sort === 'level') {
      return b.userCard.level - a.userCard.level;
    }
    if (sort === 'name') {
      return a.base.name.localeCompare(b.base.name);
    }
    // Default: Rarity / ATK
    return b.base.attack - a.base.attack;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  // State: 'LIST' or 'INSPECT'
  let viewMode: 'LIST' | 'INSPECT' = 'LIST';
  let inspectedUserCardId: string | null = null;

  // 5. Render initial list view
  const initialEmbed = buildCardListEmbed(
    ctx.user.username,
    filtered,
    currentPage,
    totalPages,
    userCards.length,
    filter,
  );
  const initialComponents = buildCardListComponents(filtered, currentPage, totalPages);

  const replyMsg = await ctx.reply({
    embeds: [initialEmbed],
    components: initialComponents,
  });

  const discordMsg = (
    replyMsg && typeof replyMsg === 'object' && 'fetch' in replyMsg
      ? await (replyMsg as any).fetch()
      : replyMsg
  ) as Message | undefined;

  if (!discordMsg || typeof discordMsg !== 'object' || !('createMessageComponentCollector' in discordMsg)) {
    return;
  }

  // 6. Interactive Component Collector
  const collector = discordMsg.createMessageComponentCollector({
    time: 120_000, // 2 minutes active
  });

  collector.on('collect', async (interaction: ButtonInteraction | StringSelectMenuInteraction) => {
    if (interaction.user.id !== ctx.user.id) {
      await interaction.reply({
        content: '⏳ This is not your card album! Run `/cards` to open your own.',
        ephemeral: true,
      });
      return;
    }

    collector.resetTimer();

    // --- Handling Select Menu (Inspect Card) ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'cards:select') {
      const selectedValue = interaction.values[0];
      const cardId = selectedValue?.replace('card:', '');
      if (!cardId) {
        await interaction.deferUpdate();
        return;
      }

      inspectedUserCardId = cardId;
      viewMode = 'INSPECT';

      const target = filtered.find((c) => c.userCard.id === cardId);
      if (!target) {
        await interaction.reply({ content: '❌ Card not found in album.', ephemeral: true });
        return;
      }

      await interaction.deferUpdate();
      const { embed: inspectEmbed, files } = await buildCardInspectEmbed(services, target);
      const inspectRows = buildCardInspectComponents(target.userCard);

      await interaction.editReply({
        embeds: [inspectEmbed],
        components: inspectRows,
        files,
      });
      return;
    }

    // --- Handling Buttons ---
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // 1. Pagination
      if (customId === 'cards:first') {
        currentPage = 1;
        const embed = buildCardListEmbed(ctx.user.username, filtered, currentPage, totalPages, userCards.length, filter);
        const rows = buildCardListComponents(filtered, currentPage, totalPages);
        await interaction.update({ embeds: [embed], components: rows, files: [] });
        return;
      }

      if (customId === 'cards:prev') {
        currentPage = Math.max(1, currentPage - 1);
        const embed = buildCardListEmbed(ctx.user.username, filtered, currentPage, totalPages, userCards.length, filter);
        const rows = buildCardListComponents(filtered, currentPage, totalPages);
        await interaction.update({ embeds: [embed], components: rows, files: [] });
        return;
      }

      if (customId === 'cards:next') {
        currentPage = Math.min(totalPages, currentPage + 1);
        const embed = buildCardListEmbed(ctx.user.username, filtered, currentPage, totalPages, userCards.length, filter);
        const rows = buildCardListComponents(filtered, currentPage, totalPages);
        await interaction.update({ embeds: [embed], components: rows, files: [] });
        return;
      }

      if (customId === 'cards:last') {
        currentPage = totalPages;
        const embed = buildCardListEmbed(ctx.user.username, filtered, currentPage, totalPages, userCards.length, filter);
        const rows = buildCardListComponents(filtered, currentPage, totalPages);
        await interaction.update({ embeds: [embed], components: rows, files: [] });
        return;
      }

      // 2. Back to List
      if (customId === 'cards:back') {
        viewMode = 'LIST';
        inspectedUserCardId = null;
        const embed = buildCardListEmbed(ctx.user.username, filtered, currentPage, totalPages, userCards.length, filter);
        const rows = buildCardListComponents(filtered, currentPage, totalPages);
        await interaction.update({ embeds: [embed], components: rows, files: [] });
        return;
      }

      // 3. Equip Vanguard
      if (customId.startsWith('cards:equip:')) {
        const cardId = customId.replace('cards:equip:', '');
        const target = filtered.find((c) => c.userCard.id === cardId);

        if (!target) {
          await interaction.reply({ content: '❌ Card not found.', ephemeral: true });
          return;
        }

        if (target.userCard.state === 'IN_TRADE' || target.userCard.state === 'IN_MARKET') {
          await interaction.reply({
            content: `❌ Cannot equip card locked in \`${target.userCard.state}\`.`,
            ephemeral: true,
          });
          return;
        }

        // Set all existing equipped cards to IDLE
        const equipped = await services.waifuCardRepo.listUserCards(ctx.user.id, { state: 'EQUIPPED' });
        for (const eq of equipped) {
          await services.waifuCardRepo.updateUserCardState(eq.id, 'IDLE');
          const match = filtered.find((f) => f.userCard.id === eq.id);
          if (match) match.userCard.state = 'IDLE';
        }

        // Equip target card
        await services.waifuCardRepo.updateUserCardState(cardId, 'EQUIPPED');
        target.userCard.state = 'EQUIPPED';

        await interaction.deferUpdate();
        const { embed: inspectEmbed, files } = await buildCardInspectEmbed(services, target);
        const inspectRows = buildCardInspectComponents(target.userCard);

        await interaction.editReply({
          embeds: [inspectEmbed],
          components: inspectRows,
          files,
        });
        return;
      }

      // 4. Toggle Favorite
      if (customId.startsWith('cards:fav:')) {
        const cardId = customId.replace('cards:fav:', '');
        const target = filtered.find((c) => c.userCard.id === cardId);

        if (!target) {
          await interaction.reply({ content: '❌ Card not found.', ephemeral: true });
          return;
        }

        const newFav = !target.userCard.isFavorite;
        await services.waifuCardRepo.toggleUserCardFavorite(cardId, newFav);
        target.userCard.isFavorite = newFav;

        await interaction.deferUpdate();
        const { embed: inspectEmbed, files } = await buildCardInspectEmbed(services, target);
        const inspectRows = buildCardInspectComponents(target.userCard);

        await interaction.editReply({
          embeds: [inspectEmbed],
          components: inspectRows,
          files,
        });
        return;
      }
    }
  });

  // 7. Cleanup on timeout
  collector.on('end', async () => {
    try {
      // Disable all components
      const disabledRows = discordMsg.components.map((row: any) => {
        const actionRow = ActionRowBuilder.from(row) as ActionRowBuilder<any>;
        actionRow.components.forEach((comp: any) => comp.setDisabled(true));
        return actionRow;
      });

      await discordMsg.edit({ components: disabledRows }).catch(() => {});
    } catch {
      // message may have been deleted
    }
  });
}
