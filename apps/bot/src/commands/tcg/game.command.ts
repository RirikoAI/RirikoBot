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
import { type ExpeditionDuration } from '@ririko/services';

export function createGameCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'game',
      category: CommandCategory.TCG,
      description: 'TCG Game Modes: PvP Duels, Timed Expeditions, Boss Raids, and Quest Milestones.',
      aliases: ['battle', 'duel', 'tcggame'],
      usage: '/game [action: pvp|explore|boss|quests] [user] [wager] [duration] [subaction] [quest_id]',
      examples: [
        '/game action:pvp user:@Friend wager:100',
        '/game action:explore duration:4h subaction:start',
        '/game action:explore subaction:claim',
        '/game action:boss subaction:attack',
        '/game action:quests subaction:list',
        '/game action:quests subaction:claim quest_id:daily_pvp_win',
      ],
      options: [
        {
          name: 'action',
          description: 'Game mode action (pvp, explore, boss, quests)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'PvP Duel (Elemental card combat vs player)', value: 'pvp' },
            { name: 'Timed Expeditions (Explore 1h, 4h, 8h for loot)', value: 'explore' },
            { name: 'World Boss Raid (Cooperative massive HP titan)', value: 'boss' },
            { name: 'Quests (Daily & weekly mission milestones)', value: 'quests' },
            { name: 'Town Shop (Browse standard equipment and potions)', value: 'shop' },
            { name: 'Buy Item (Purchase item with wallet credits)', value: 'buy' },
          ],
        },
        {
          name: 'user',
          description: 'Target player to challenge in PvP duel',
          type: 'USER',
          required: false,
        },
        {
          name: 'wager',
          description: 'Optional credit wager for PvP duel',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'duration',
          description: 'Expedition duration tier (1h, 4h, 8h)',
          type: 'STRING',
          required: false,
          choices: [
            { name: '1 Hour (10 Energy)', value: '1h' },
            { name: '4 Hours (25 Energy)', value: '4h' },
            { name: '8 Hours (45 Energy)', value: '8h' },
          ],
        },
        {
          name: 'subaction',
          description: 'Subaction for mode (start, claim, status, attack, list)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Start / Deploy', value: 'start' },
            { name: 'Claim Rewards', value: 'claim' },
            { name: 'Status / Check', value: 'status' },
            { name: 'Attack Boss', value: 'attack' },
            { name: 'List Quests', value: 'list' },
          ],
        },
        {
          name: 'quest_id',
          description: 'Specific quest ID to claim',
          type: 'STRING',
          required: false,
        },
        {
          name: 'item',
          description: 'Item code or ID to purchase from Town Shop',
          type: 'STRING',
          required: false,
        },
        {
          name: 'quantity',
          description: 'Quantity to purchase from Town Shop',
          type: 'INTEGER',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const rawArgs = ctx.options.getRawArgs?.() ?? [];
      let action = ctx.options.getString('action')?.toLowerCase();

      if (!action) {
        try {
          const optionsRecord = ctx.options as unknown as Record<string, unknown>;
          const sc = typeof optionsRecord['getSubcommand'] === 'function'
            ? (optionsRecord['getSubcommand'] as () => string)()
            : null;
          if (sc) action = String(sc).toLowerCase();
        } catch {
          // ignore
        }
      }

      if (!action) {
        const first = rawArgs[0]?.toLowerCase();
        if (['pvp', 'explore', 'boss', 'quests', 'shop', 'buy'].includes(first ?? '')) {
          action = first;
        } else {
          action = 'quests';
        }
      }

      switch (action) {
        case 'pvp': {
          const targetUser = await ctx.options.getUser('user');
          if (!targetUser) {
            await ctx.reply({
              content: '❌ Please mention or specify a user to challenge in a PvP duel. Usage: `/game action:pvp user:@User [wager]`',
              ephemeral: true,
            });
            return;
          }

          if (targetUser.id === ctx.user.id) {
            await ctx.reply({
              content: '❌ You cannot duel yourself!',
              ephemeral: true,
            });
            return;
          }

          const wager = Math.max(0, ctx.options.getInteger('wager') ?? 0);

          // Get challenger and opponent combat cards
          const challengerCards = await services.loadoutService.buildActiveParty(ctx.user.id, 'TEAM_A');
          if (challengerCards.length === 0) {
            await ctx.reply({
              content: '❌ You have no cards in your collection to duel with! Claim card drops first using `/card claim`.',
              ephemeral: true,
            });
            return;
          }

          const opponentCards = await services.loadoutService.buildActiveParty(targetUser.id, 'TEAM_B');
          if (opponentCards.length === 0) {
            await ctx.reply({
              content: `❌ <@${targetUser.id}> does not have any cards in their collection yet!`,
              ephemeral: true,
            });
            return;
          }

          const duelResult = await services.pvpDuelService.executeDuel({
            challengerId: ctx.user.id,
            opponentId: targetUser.id,
            challengerCards,
            opponentCards,
            wagerCredits: wager,
          });

          if (!duelResult.success) {
            await ctx.reply({ content: `❌ ${duelResult.error}`, ephemeral: true });
            return;
          }

          // Record PvP quest progress
          if (duelResult.winnerUserId === ctx.user.id) {
            services.questService.recordProgress(ctx.user.id, 'daily_pvp_win', 1);
          } else if (duelResult.winnerUserId === targetUser.id) {
            services.questService.recordProgress(targetUser.id, 'daily_pvp_win', 1);
          }

          const isChallengerWinner = duelResult.winnerUserId === ctx.user.id;
          const isDraw = duelResult.winnerUserId === 'DRAW';

          const topLogs = (duelResult.combatResult?.logs ?? [])
            .slice(0, 6)
            .map((l) => `• [T${l.turn}] ${l.message}`)
            .join('\n');

          const embed = new EmbedBuilder()
            .setTitle(`⚔️ PvP Elemental Duel: ${ctx.user.username} vs ${targetUser.username}`)
            .setColor(isDraw ? 0x808080 : isChallengerWinner ? 0x00ff00 : 0xff0000)
            .setDescription(
              (isDraw
                ? '🤝 **The battle ended in a stalemate DRAW!**'
                : `🏆 **Winner: <@${duelResult.winnerUserId}>** (+${duelResult.ratingDelta} Rating Rating)`) +
                (duelResult.wagerWon ? `\n💰 **Wager Won**: \`${duelResult.wagerWon} Coins\`!` : '') +
                `\n⚡ **Energy Expended**: 5 Energy\n\n` +
                `📜 **Combat Action Log**\n${topLogs}`,
            )
            .setFooter({ text: 'TCG PvP Duels • Energy Cost: 5' });

          await ctx.reply({ embeds: [embed] });
          break;
        }

        case 'explore': {
          const subaction = ctx.options.getString('subaction')?.toLowerCase() ?? rawArgs[1]?.toLowerCase() ?? 'status';
          const duration = (ctx.options.getString('duration')?.toLowerCase() ?? rawArgs[2]?.toLowerCase() ?? '1h') as ExpeditionDuration;

          if (subaction === 'start') {
            const userCards = await services.waifuCardRepo.listUserCards(ctx.user.id, { limit: 1 });
            if (userCards.length === 0) {
              await ctx.reply({
                content: '❌ You need at least 1 card to send on an expedition!',
                ephemeral: true,
              });
              return;
            }

            const startRes = await services.expeditionService.startExpedition(
              ctx.user.id,
              userCards[0]!.id,
              duration,
            );

            if (!startRes.success) {
              await ctx.reply({ content: `❌ ${startRes.error}`, ephemeral: true });
              return;
            }

            const completesTimestamp = Math.floor(startRes.expedition!.completesAt.getTime() / 1000);
            await ctx.reply({
              content: `🧭 **Expedition Deployed!**\n` +
                `• **Duration**: \`${duration}\`\n` +
                `• **Energy Consumed**: \`${startRes.expedition!.energyCost} Energy\`\n` +
                `• **Returns**: <t:${completesTimestamp}:R> (<t:${completesTimestamp}:t>)\n` +
                `Claim your rewards when finished via \`/game action:explore subaction:claim\`.`,
            });
            return;
          }

          if (subaction === 'claim') {
            const expeditions = services.expeditionService.getUserExpeditions(ctx.user.id);
            const unclaimed = expeditions.filter((e) => !e.isClaimed);

            if (unclaimed.length === 0) {
              await ctx.reply({
                content: '📭 You have no active expeditions to claim! Deploy one with `/game action:explore subaction:start duration:1h`.',
                ephemeral: true,
              });
              return;
            }

            const exp = unclaimed[0]!;
            const claimRes = await services.expeditionService.claimExpedition(ctx.user.id, exp.id);

            if (!claimRes.success) {
              await ctx.reply({ content: `⏳ ${claimRes.error}`, ephemeral: true });
              return;
            }

            // Record quest progress
            services.questService.recordProgress(ctx.user.id, 'daily_expedition_complete', 1);

            await ctx.reply({
              content: `🎉 **Expedition Completed!**\n` +
                `• **Credits Earned**: \`+${claimRes.rewards?.credits} Coins\`\n` +
                `• **Crafting Dust**: \`+${claimRes.rewards?.dust} Dust\`\n` +
                (claimRes.rewards?.cardShards ? `• **Bonus**: \`+${claimRes.rewards.cardShards} Card Shard\`! ✨\n` : ''),
            });
            return;
          }

          // Default: status
          const activeExps = services.expeditionService.getUserExpeditions(ctx.user.id);
          if (activeExps.length === 0) {
            await ctx.reply({
              content: '🧭 **No active expeditions deployed.**\nDeploy your cards with `/game action:explore subaction:start duration:1h` (1h, 4h, 8h).',
              ephemeral: true,
            });
            return;
          }

          const lines = activeExps.map((e) => {
            const ts = Math.floor(e.completesAt.getTime() / 1000);
            const status = e.isClaimed ? '✅ Claimed' : Date.now() >= e.completesAt.getTime() ? '🎁 Ready to Claim' : `⏳ Returns <t:${ts}:R>`;
            return `• **Tier**: \`${e.tier}\` | ${status}`;
          });

          await ctx.reply({
            content: `🧭 **Your Timed Expeditions**:\n${lines.join('\n')}`,
          });
          break;
        }

        case 'boss': {
          const subaction = ctx.options.getString('subaction')?.toLowerCase() ?? rawArgs[1]?.toLowerCase() ?? 'status';

          if (subaction === 'attack') {
            const combatCards = await services.loadoutService.buildActiveParty(ctx.user.id, 'TEAM_A');
            if (combatCards.length === 0) {
              await ctx.reply({
                content: '❌ You need at least 1 equipped card to attack the World Boss!',
                ephemeral: true,
              });
              return;
            }

            const attackRes = await services.bossRaidService.attackBoss(ctx.user.id, combatCards[0]!);
            if (!attackRes.success) {
              await ctx.reply({ content: `❌ ${attackRes.error}`, ephemeral: true });
              return;
            }

            // Record weekly raid quest progress
            services.questService.recordProgress(ctx.user.id, 'weekly_boss_raid_damage', attackRes.damageDealt);

            const boss = services.bossRaidService.getCurrentBoss();
            const hpPct = ((boss.currentHp / boss.totalHp) * 100).toFixed(1);

            const embed = new EmbedBuilder()
              .setTitle(`⚔️ World Boss Raid: ${boss.name}`)
              .setColor(0x800080)
              .setDescription(
                `💥 You dealt **${attackRes.damageDealt.toLocaleString()} DMG** to **${boss.name}**!\n\n` +
                  `📊 **Boss Health**: \`${boss.currentHp.toLocaleString()} / ${boss.totalHp.toLocaleString()} HP\` (${hpPct}%)\n` +
                  `⚡ **Energy Expended**: 30 Energy\n\n` +
                  `🎁 **Rewards Awarded**:\n` +
                  `• **Raid Badges**: \`+${attackRes.rewards?.raidBadges}\` 🎖️\n` +
                  `• **Credits**: \`+${attackRes.rewards?.credits} Coins\` 🪙\n` +
                  `• **Crafting Dust**: \`+${attackRes.rewards?.craftingDust} Dust\` 💎` +
                  (attackRes.isBossDefeated ? '\n\n🎉 **THE WORLD BOSS HAS BEEN VANQUISHED!**' : ''),
              )
              .setFooter({ text: 'Cooperative World Boss • 30 Energy per attack' });

            await ctx.reply({ embeds: [embed] });
            return;
          }

          // Default: status
          const boss = services.bossRaidService.getCurrentBoss();
          const leaderboard = services.bossRaidService.getLeaderboard().slice(0, 5);
          const hpPct = ((boss.currentHp / boss.totalHp) * 100).toFixed(1);

          const lbLines = leaderboard.length > 0
            ? leaderboard.map((p, idx) => `${idx + 1}. <@${p.userId}> — **${p.totalDamage.toLocaleString()} DMG** (${p.attemptsCount} attempts)`)
            : ['*No players have attacked this boss cycle yet. Be the first!*'];

          const embed = new EmbedBuilder()
            .setTitle(`👹 World Boss: ${boss.name} (${boss.element})`)
            .setColor(0x800080)
            .setDescription(
              `*${boss.title}*\n\n` +
                `📊 **Boss Health**: \`${boss.currentHp.toLocaleString()} / ${boss.totalHp.toLocaleString()} HP\` (${hpPct}%)\n` +
                `• **Element**: \`${boss.element}\` (Fire melts Ice, Lightning shocks Water, etc.)\n` +
                `• **ATK / DEF**: \`${boss.attack} ATK\` | \`${boss.defense} DEF\`\n\n` +
                `🏆 **Top Raid Contributors**:\n${lbLines.join('\n')}\n\n` +
                `Attack using \`/game action:boss subaction:attack\` (Cost: 30 Energy).`,
            );

          await ctx.reply({ embeds: [embed] });
          break;
        }

        case 'quests': {
          const subaction = ctx.options.getString('subaction')?.toLowerCase() ?? rawArgs[1]?.toLowerCase() ?? 'list';
          const questId = ctx.options.getString('quest_id') ?? rawArgs[2];

          if (subaction === 'claim') {
            if (!questId) {
              await ctx.reply({
                content: '❌ Please specify a Quest ID to claim. Example: `/game action:quests subaction:claim quest_id:daily_pvp_win`',
                ephemeral: true,
              });
              return;
            }

            const claimRes = services.questService.claimQuest(ctx.user.id, questId);
            if (!claimRes.success) {
              await ctx.reply({ content: `❌ ${claimRes.error}`, ephemeral: true });
              return;
            }

            await ctx.reply({
              content: `🎉 **Quest Claimed: ${claimRes.questTitle}!**\n` +
                `• **Credits**: \`+${claimRes.rewardCredits} Coins\`\n` +
                `• **Crafting Dust**: \`+${claimRes.rewardDust} Dust\`\n` +
                (claimRes.rewardTicket ? '• **Bonus**: `+1 Summon Ticket`! 🎫\n' : ''),
            });
            return;
          }

          // Default: list quests
          const userQuests = services.questService.getUserQuests(ctx.user.id);
          const questLines = userQuests.map((q) => {
            const statusIcon = q.isClaimed ? '✅ Claimed' : q.isCompleted ? '🎁 Ready (`/game quests claim ' + q.questId + '`)' : `⏳ Progress: ${q.currentCount}/${q.targetCount}`;
            return `• **${q.quest.title}** (\`${q.quest.type}\`)\n  ${q.quest.description}\n  Status: ${statusIcon} — Reward: \`${q.quest.rewardCredits} Coins\`, \`${q.quest.rewardDust} Dust\``;
          });

          const embed = new EmbedBuilder()
            .setTitle(`📜 Commander ${ctx.user.username}'s Daily & Weekly Missions`)
            .setColor(0x00bfff)
            .setDescription(questLines.join('\n\n'))
            .setFooter({ text: 'Complete missions daily and weekly for free coins and crafting dust!' });

          await ctx.reply({ embeds: [embed] });
          break;
        }

        case 'shop': {
          await handleShop(ctx, services, rawArgs);
          break;
        }

        case 'buy': {
          await handleBuy(ctx, services, rawArgs);
          break;
        }

        default:
          await ctx.reply({ content: `Unknown action: ${action}`, ephemeral: true });
      }
    },
  };
}

async function handleShop(
  ctx: CommandContext,
  services: BotServices,
  rawArgs: readonly string[],
): Promise<void> {
  const category = (ctx.options.getString('subaction') ?? rawArgs[1])?.toUpperCase();
  const catalog = await services.tcgShopService.getCatalog(category);

  if (catalog.length === 0) {
    await ctx.reply({ content: '🛒 The Town Item Shop is currently restocked or closed.' });
    return;
  }

  let selectedIndex = 0;

  const buildShopEmbed = (itemIdx: number, successNotice?: string) => {
    const selected = catalog[itemIdx]!;
    const lines = catalog.map((item, idx) => {
      const isCurrent = idx === itemIdx;
      const marker = isCurrent ? '👉 ' : '• ';
      const dailyLimit = item.maxDailyPurchases > 0 ? ` (Limit: ${item.maxDailyPurchases}/day)` : '';
      const perks = item.battlePerks && item.battlePerks.length > 0 ? ` | *Perk: ${item.battlePerks.join(', ')}*` : '';
      return `${marker}**${item.name}** (\`${item.code}\`) — 🪙 **${item.shopPrice.toLocaleString()} credits** [${item.rarity}]${dailyLimit}${perks}\n  *${item.description}*`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🏪 Town Item Shop Catalog — Interactive')
      .setDescription(
        (successNotice ? `${successNotice}\n\n` : '') +
        `Welcome to the Town Shop, summoner! Select an item below and choose quantity to purchase.\n\n` +
        lines.join('\n\n') +
        `\n\n🎯 **Selected Item**: **${selected.name}** (${selected.shopPrice.toLocaleString()} credits each)\n` +
        `*${selected.description}*`,
      )
      .setFooter({ text: 'Double-entry ledger audited | Buy with buttons below' });

    return embed;
  };

  const buildShopComponents = (itemIdx: number) => {
    const selected = catalog[itemIdx]!;

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('shop:select_item')
      .setPlaceholder(`Selected: ${selected.name} (${selected.shopPrice} credits)`);

    for (let i = 0; i < Math.min(25, catalog.length); i++) {
      const it = catalog[i]!;
      const isPot = it.subtype === 'HP_POTION' || it.subtype === 'MANA_POTION' || it.subtype === 'ENERGY_POTION';
      const icon = it.subtype === 'HP_POTION' ? '🧪' : it.subtype === 'MANA_POTION' ? '🔷' : isPot ? '⚡' : '⚔️';
      selectMenu.addOptions({
        label: `${icon} ${it.name} — ${it.shopPrice} credits`,
        description: it.description ? it.description.slice(0, 100) : `${it.type} item`,
        value: String(i),
        default: i === itemIdx,
      });
    }

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('shop:buy:1')
        .setLabel(`🛍️ Buy 1x (${selected.shopPrice}c)`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('shop:buy:5')
        .setLabel(`🛍️ Buy 5x (${selected.shopPrice * 5}c)`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('shop:buy:10')
        .setLabel(`🛍️ Buy 10x (${selected.shopPrice * 10}c)`)
        .setStyle(ButtonStyle.Secondary),
    );

    return [selectRow, buttonRow];
  };

  const initialEmbed = buildShopEmbed(selectedIndex);
  const initialComponents = buildShopComponents(selectedIndex);

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
      await interaction.reply({ content: '⏳ This is not your shop menu!', ephemeral: true });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'shop:select_item') {
      const idx = parseInt(interaction.values[0] ?? '0', 10);
      if (!isNaN(idx) && idx >= 0 && idx < catalog.length) {
        selectedIndex = idx;
      }
      const updatedEmbed = buildShopEmbed(selectedIndex);
      const updatedComponents = buildShopComponents(selectedIndex);
      await interaction.update({ embeds: [updatedEmbed], components: updatedComponents }).catch(() => {});
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('shop:buy:')) {
      const qty = parseInt(interaction.customId.split(':')[2] ?? '1', 10);
      const selectedItem = catalog[selectedIndex]!;

      try {
        const receipt = await services.tcgShopService.buyItem(
          ctx.user.id,
          selectedItem.code,
          qty,
          ctx.guild?.id,
        );

        const notice = `✅ **Purchased ${receipt.quantity}x ${receipt.item.name}** for **${receipt.totalPrice.toLocaleString()} credits**! (Wallet remaining: \`${receipt.walletBalanceAfter.toLocaleString()} credits\`)`;
        const updatedEmbed = buildShopEmbed(selectedIndex, notice);
        const updatedComponents = buildShopComponents(selectedIndex);
        await interaction.update({ embeds: [updatedEmbed], components: updatedComponents }).catch(() => {});
      } catch (err: unknown) {
        await interaction.reply({
          content: `❌ **Purchase Failed**: ${err instanceof Error ? err.message : String(err)}`,
          ephemeral: true,
        });
      }
    }
  });

  collector.on('end', async () => {
    const disabledComponents = buildShopComponents(selectedIndex);
    for (const row of disabledComponents) {
      for (const comp of row.components) {
        comp.setDisabled(true);
      }
    }
    await discordMsg.edit({ components: disabledComponents }).catch(() => {});
  });
}

async function handleBuy(
  ctx: CommandContext,
  services: BotServices,
  rawArgs: readonly string[],
): Promise<void> {
  const itemCode = ctx.options.getString('item') ?? rawArgs[1];
  const quantity = ctx.options.getInteger('quantity') ?? (rawArgs[2] ? parseInt(rawArgs[2], 10) : 1);

  if (!itemCode) {
    await ctx.reply({
      content: '❌ Please specify an item code to purchase. Usage: `/game action:buy item:<code_or_id> [quantity]`',
      ephemeral: true,
    });
    return;
  }

  try {
    const receipt = await services.tcgShopService.buyItem(
      ctx.user.id,
      itemCode,
      quantity,
      ctx.guild?.id,
    );

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🛍️ Town Shop Purchase Successful!')
      .setDescription(
        `Acquired **${receipt.quantity}x ${receipt.item.name}**!\n\n` +
          `• **Total Price**: \`${receipt.totalPrice.toLocaleString()} credits\`\n` +
          `• **Remaining Wallet**: \`${receipt.walletBalanceAfter.toLocaleString()} credits\`\n\n` +
          `*View your new items with:* \`/item action:inventory\``,
      )
      .setFooter({ text: 'Audited via double-entry financial ledger (SHOP_BUY)' });

    await ctx.reply({ embeds: [embed] });
  } catch (err: unknown) {
    await ctx.reply({
      content: `❌ **Purchase Failed**: ${err instanceof Error ? err.message : String(err)}`,
      ephemeral: true,
    });
  }
}
