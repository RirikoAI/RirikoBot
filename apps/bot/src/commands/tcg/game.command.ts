import { EmbedBuilder } from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';
import {
  type Combatant,
  type CombatElement,
  type CardRarity,
  type ExpeditionDuration,
  LevelingEngine,
} from '@ririko/services';

const levelingEngine = new LevelingEngine();

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
        if (['pvp', 'explore', 'boss', 'quests'].includes(first ?? '')) {
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
          const challengerCards = await fetchUserCombatCards(services, ctx.user.id, 'TEAM_A');
          if (challengerCards.length === 0) {
            await ctx.reply({
              content: '❌ You have no cards in your collection to duel with! Claim card drops first using `/card claim`.',
              ephemeral: true,
            });
            return;
          }

          const opponentCards = await fetchUserCombatCards(services, targetUser.id, 'TEAM_B');
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
            const combatCards = await fetchUserCombatCards(services, ctx.user.id, 'TEAM_A');
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

        default:
          await ctx.reply({ content: `Unknown action: ${action}`, ephemeral: true });
      }
    },
  };
}

async function fetchUserCombatCards(
  services: BotServices,
  userId: string,
  team: 'TEAM_A' | 'TEAM_B',
): Promise<Combatant[]> {
  let userCards = await services.waifuCardRepo.listUserCards(userId, { state: 'EQUIPPED' });
  if (userCards.length === 0) {
    userCards = await services.waifuCardRepo.listUserCards(userId, { limit: 1 });
  }

  const combatants: Combatant[] = [];
  for (const uc of userCards) {
    const base = await services.waifuCardRepo.findById(uc.cardId);
    if (!base) continue;

    const scaled = levelingEngine.calculateScaledStats(
      {
        hp: base.health,
        attack: base.attack,
        defense: base.defense,
        speed: base.speed,
        critRate: base.critRate,
        mp: 100,
      },
      uc.level,
    );

    combatants.push({
      id: uc.id,
      name: `${base.name} (Lv.${uc.level})`,
      team,
      element: (base.element as CombatElement) ?? 'FIRE',
      rarity: (base.rarity as CardRarity) ?? 'COMMON',
      level: uc.level,
      maxHealth: scaled.hp,
      currentHealth: scaled.hp,
      attack: scaled.attack,
      defense: scaled.defense,
      speed: scaled.speed,
      critRate: scaled.critRate,
      critDamage: 1.5,
      maxMp: 100,
      currentMp: 0,
      skillName: base.skillName ?? undefined,
      skillDescription: base.skillDescription ?? undefined,
      skillManaCost: 50,
      passiveName: base.passiveName ?? undefined,
      passiveDescription: base.passiveDescription ?? undefined,
      shield: 0,
      statusEffects: [],
      perks: [],
      hasUsedPhoenixWard: false,
      isAlive: true,
    });
  }

  return combatants;
}
