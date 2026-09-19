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
  LevelingEngine,
  getDungeonFloorEnergyCost,
} from '@ririko/services';

const levelingEngine = new LevelingEngine();

export function createDungeonCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'dungeon',
      category: CommandCategory.TCG,
      description: 'PvE Seasonal Dungeon Tower: Climb floors, challenge bosses, and overcome environmental affixes.',
      aliases: ['tower', 'climb', 'spire'],
      usage: '/dungeon [action: status|climb|floor|leaderboard|tutorial] [floor_number]',
      examples: [
        '/dungeon action:status',
        '/dungeon action:climb',
        '/dungeon action:floor floor_number:10',
        '/dungeon action:leaderboard',
        '/dungeon action:tutorial',
      ],
      options: [
        {
          name: 'action',
          description: 'Dungeon action (status, climb, floor, leaderboard, tutorial)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Status (Current season, highest floor, energy)', value: 'status' },
            { name: 'Climb (Battle the next unlocked floor)', value: 'climb' },
            { name: 'Floor Info (Inspect floor stats and enemies)', value: 'floor' },
            { name: 'Leaderboard (Top season tower climbers)', value: 'leaderboard' },
            { name: 'Tutorial (Prologue onboarding & starter pack)', value: 'tutorial' },
          ],
        },
        {
          name: 'floor_number',
          description: 'Floor number to inspect or challenge',
          type: 'INTEGER',
          required: false,
        },
      ],
    },
    execute: async (ctx: CommandContext): Promise<void> => {
      const rawArgs = ctx.options.getRawArgs?.() ?? [];
      const isClimbAlias =
        ctx.source === 'prefix' &&
        ctx.raw &&
        'content' in ctx.raw &&
        ctx.raw.content.slice(ctx.invokedPrefix.length).trim().split(/\s+/)[0]?.toLowerCase() === 'climb';

      const action =
        ctx.options.getString('action')?.toLowerCase() ??
        (isClimbAlias ? 'climb' : rawArgs[0]?.toLowerCase()) ??
        'status';

      const activeSeason = (await services.dungeonSeasonRepo.findActiveSeason()) ?? {
        id: 's1_infernal_crucible',
        name: 'Season 1: Infernal Crucible',
        themeElement: 'FIRE',
        seasonalAffixes: ['SCORCHED_EARTH', 'HEAT_HAZE'],
      };

      switch (action) {
        case 'status': {
          const progress = await services.userDungeonProgressRepo.getOrCreateProgress(ctx.user.id, activeSeason.id);
          const energy = await services.playerEnergyRepo.getOrCreate(ctx.user.id);
          const nextFloor = progress.highestClearedFloor + 1;
          const nextCost = getDungeonFloorEnergyCost(nextFloor);
          const nextFloorType = services.scalingEngine.getFloorType(nextFloor);

          const affixesStr =
            activeSeason.seasonalAffixes && activeSeason.seasonalAffixes.length > 0
              ? activeSeason.seasonalAffixes.join(', ')
              : 'None';

          const embed = new EmbedBuilder()
            .setTitle(`🏰 ${activeSeason.name} — Tower Status`)
            .setColor(0xff4500)
            .setDescription(
              `Summoner **${ctx.user.username}**, welcome to the seasonal dungeon tower!\n\n` +
                `• **Current Season**: \`${activeSeason.name}\`\n` +
                `• **Theme Element**: \`${activeSeason.themeElement ?? 'FIRE'}\`\n` +
                `• **Active Affixes**: \`${affixesStr}\`\n` +
                `• **Highest Floor Cleared**: \`Floor ${progress.highestClearedFloor}\`\n` +
                `• **Total Attempts**: \`${progress.attemptsCount}\` (Wins: \`${progress.clearCount}\`)\n` +
                `• **Energy Available**: \`${energy.currentEnergy}/${energy.maxEnergy} Energy\`\n\n` +
                `⚔️ **Next Challenge**: **Floor ${nextFloor}** [${nextFloorType}]\n` +
                `• **Entry Cost**: \`${nextCost} Energy\`\n\n` +
                `*Commands:* \`/dungeon climb\` to battle | \`/dungeon floor <id>\` to inspect | \`/dungeon leaderboard\``,
            )
            .setFooter({ text: 'Seasonal Tower resets every 60–90 days with fresh environmental affixes.' });

          await ctx.reply({ embeds: [embed] });
          break;
        }

        case 'climb': {
          // Tutorial Gate: ensure players clear Prologue Floors T1–T4 first
          const tutorialProgress = await services.userDungeonProgressRepo.getOrCreateProgress(
            ctx.user.id,
            'season_tutorial',
          );

          if (tutorialProgress.highestClearedFloor < 4) {
            await handleTutorialClimb(ctx, services, tutorialProgress.highestClearedFloor + 1);
            return;
          }

          const userCards = await fetchUserCombatCards(services, ctx.user.id, 'TEAM_A');
          if (userCards.length === 0) {
            await ctx.reply({
              content:
                '❌ You have no cards available to climb the dungeon! Claim or equip a card first with `/card claim` or `/card equip`.',
              ephemeral: true,
            });
            return;
          }

          const progress = await services.userDungeonProgressRepo.getOrCreateProgress(ctx.user.id, activeSeason.id);
          const floorToClimb =
            ctx.options.getInteger('floor_number') ??
            (isClimbAlias && rawArgs[0] && !isNaN(parseInt(rawArgs[0], 10))
              ? parseInt(rawArgs[0], 10)
              : rawArgs[1] && !isNaN(parseInt(rawArgs[1], 10))
                ? parseInt(rawArgs[1], 10)
                : progress.highestClearedFloor + 1);

          const runResult = await services.dungeonRunner.runFloor({
            userId: ctx.user.id,
            seasonId: activeSeason.id,
            floorNumber: floorToClimb,
            playerParty: userCards,
          });

          if (!runResult.success) {
            await ctx.reply({
              content: `❌ **Climb Failed**: ${runResult.error}`,
              ephemeral: true,
            });
            return;
          }

          // Build log preview of highlights (up to 8 noteworthy logs)
          const highlightLogs = runResult.logs
            .filter(
              (l) =>
                l.actionType === 'ENRAGE' ||
                l.message.includes('SHATTERED') ||
                l.message.includes('BROKEN') ||
                l.message.includes('absorbed') ||
                l.message.includes('CRITICAL') ||
                l.message.includes('vanquished') ||
                l.message.includes('seared') ||
                l.message.includes('healed'),
            )
            .slice(-6);

          const logSection =
            highlightLogs.length > 0
              ? `\n**⚔️ Battle Highlights:**\n` + highlightLogs.map((l) => `Turn ${l.turn}: ${l.message}`).join('\n')
              : '';

          const embed = new EmbedBuilder()
            .setTitle(
              runResult.victory
                ? `🏆 Floor ${runResult.floorNumber} CLEARED! — Victory!`
                : `💀 Floor ${runResult.floorNumber} Defeat`,
            )
            .setColor(runResult.victory ? 0x57f287 : 0xed4245)
            .setDescription(
              `**Dungeon Run Report: Floor ${runResult.floorNumber}**\n` +
                `• **Outcome**: ${runResult.victory ? '✅ **VICTORY**' : '❌ **DEFEATED**'}\n` +
                `• **Turns Total**: \`${runResult.turnsTotal}/25 Turns\`\n` +
                `• **Energy Consumed**: \`${runResult.energySpent} Energy\`\n` +
                `• **Highest Floor**: \`Floor ${runResult.highestFloorCleared}\`\n` +
                logSection +
                (runResult.loot ? `\n\n${runResult.loot.message}` : ''),
            )
            .setFooter({
              text: runResult.victory
                ? 'Proceed to the next floor with /dungeon climb!'
                : 'Tip: Counter the enemy element, equip enhanced gear, or bring potions!',
            });

          await ctx.reply({ embeds: [embed] });
          break;
        }

        case 'floor': {
          const floorNumber =
            ctx.options.getInteger('floor_number') ??
            (rawArgs[1] ? parseInt(rawArgs[1], 10) : 1);

          const stats = services.scalingEngine.calculateFloorStats(floorNumber);
          const floorType = services.scalingEngine.getFloorType(floorNumber);
          const bossMult = services.scalingEngine.getBossMultiplier(floorNumber);
          const energyCost = getDungeonFloorEnergyCost(floorNumber);
          const sample = services.scalingEngine.getSampleProgression(floorNumber);

          const embed = new EmbedBuilder()
            .setTitle(`🔍 Dungeon Inspection — Floor ${floorNumber} [${floorType}]`)
            .setColor(floorType === 'MAJOR_BOSS' ? 0xff0055 : floorType === 'MINI_BOSS' ? 0xffaa00 : 0x00bfff)
            .setDescription(
              `**Enemy Intelligence Report**:\n` +
                `• **Floor Bracket**: \`Floor ${floorNumber}\` (${floorType})\n` +
                `• **Boss Stat Multiplier**: \`${bossMult}x\`\n` +
                `• **Energy Required**: \`${energyCost} Energy\`\n\n` +
                `**Scaled Enemy Attributes**:\n` +
                `• ❤️ **HP**: \`${stats.hp.toLocaleString()}\`\n` +
                `• ⚔️ **ATK**: \`${stats.attack.toLocaleString()}\`\n` +
                `• 🛡️ **DEF**: \`${stats.defense.toLocaleString()}\`\n` +
                `• 💨 **SPD**: \`${stats.speed}\`\n\n` +
                (sample ? `🎯 **Strategic Check**: *${sample.check}*\n\n` : '') +
                `🛡️ **Special Defenses**: ${floorNumber >= 20 && floorType !== 'STANDARD' ? 'Active Multi-Layer Elemental Wards' : 'Standard Barrier'}\n` +
                `⚠️ **Enrage Clock**: Turn 10+ (+100% ATK/turn with unblockable true damage strikes)`,
            )
            .setFooter({ text: 'Challenge this floor with /dungeon climb floor_number:' + floorNumber });

          await ctx.reply({ embeds: [embed] });
          break;
        }

        case 'leaderboard': {
          const climbers = await services.userDungeonProgressRepo.getSeasonLeaderboard(activeSeason.id, 10);

          if (climbers.length === 0) {
            await ctx.reply({
              content: `📊 No climbers have recorded progress in **${activeSeason.name}** yet! Be the first with \`/dungeon climb\`.`,
            });
            return;
          }

          const lines = climbers.map((c, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `\`#${idx + 1}\``;
            return `${medal} <@${c.userId}> — **Floor ${c.highestClearedFloor}** (${c.clearCount} Clears / ${c.attemptsCount} Attempts)`;
          });

          const embed = new EmbedBuilder()
            .setTitle(`🏆 ${activeSeason.name} — Top Tower Climbers`)
            .setColor(0xffd700)
            .setDescription(lines.join('\n\n'))
            .setFooter({ text: 'Compete for seasonal hall-of-fame placement and milestone rewards!' });

          await ctx.reply({ embeds: [embed] });
          break;
        }

        case 'tutorial': {
          const tutorialProgress = await services.userDungeonProgressRepo.getOrCreateProgress(
            ctx.user.id,
            'season_tutorial',
          );

          if (tutorialProgress.highestClearedFloor >= 4) {
            const embed = new EmbedBuilder()
              .setTitle('🔰 Prologue Tutorial — Training Grounds')
              .setColor(0x57f287)
              .setDescription(
                'You have already completed the Tutorial Prologue!\n' +
                'Clear Floor 1 of the seasonal tower next with `/dungeon climb`!',
              )
              .setFooter({ text: 'Clear Floor 1 of the seasonal tower next with /dungeon climb!' });

            await ctx.reply({ embeds: [embed] });
            return;
          }

          await handleTutorialClimb(ctx, services, tutorialProgress.highestClearedFloor + 1);
          break;
        }

        default:
          await ctx.reply({ content: `Unknown dungeon action: ${action}. Use /dungeon status`, ephemeral: true });
          break;
      }
    },
  };
}

async function handleTutorialClimb(
  ctx: CommandContext,
  services: BotServices,
  tutorialFloor: number,
): Promise<void> {
  // 1. Ensure the player has their starter card
  await services.tutorialService.ensureStarterCard(ctx.user.id);

  // 2. Fetch player's equipped/combat cards
  const userCards = await fetchUserCombatCards(services, ctx.user.id, 'TEAM_A');
  if (userCards.length === 0) {
    await ctx.reply({
      content: '❌ Failed to initialize starter waifu card for the tutorial. Please try again.',
      ephemeral: true,
    });
    return;
  }

  // 3. Get tutorial floor information
  const tutFloorInfo = services.tutorialService.getTutorialFloor(tutorialFloor);

  // 4. Run the tutorial floor
  const runResult = await services.dungeonRunner.runFloor({
    userId: ctx.user.id,
    seasonId: 'season_tutorial',
    floorNumber: tutorialFloor,
    playerParty: userCards,
    skipEnergyDeduction: true,
  });

  if (!runResult.success) {
    await ctx.reply({
      content: `❌ **Tutorial Run Failed**: ${runResult.error}`,
      ephemeral: true,
    });
    return;
  }

  // Build battle highlights
  const highlightLogs = runResult.logs
    .filter(
      (l) =>
        l.actionType === 'ENRAGE' ||
        l.message.includes('SHATTERED') ||
        l.message.includes('BROKEN') ||
        l.message.includes('absorbed') ||
        l.message.includes('CRITICAL') ||
        l.message.includes('vanquished') ||
        l.message.includes('seared') ||
        l.message.includes('healed'),
    )
    .slice(-6);

  const logSection =
    highlightLogs.length > 0
      ? `\n**⚔️ Battle Highlights:**\n` + highlightLogs.map((l) => `Turn ${l.turn}: ${l.message}`).join('\n')
      : '';

  if (runResult.victory) {
    if (tutorialFloor >= 4) {
      // Completed the 4th floor -> finalize tutorial & dispatch starter pack!
      const completion = await services.tutorialService.completeTutorial(ctx.user.id);
      const embed = new EmbedBuilder()
        .setTitle('🎉 Prologue Tutorial CLEARED! — Training Grounds Mastered!')
        .setColor(0x57f287)
        .setDescription(
          `**Dungeon Run Report: Floor T${tutorialFloor} [${tutFloorInfo?.topic ?? 'Shield Wards'}]**\n` +
            `• **Outcome**: ✅ **VICTORY**\n` +
            `• **Turns Total**: \`${runResult.turnsTotal}/25 Turns\`\n` +
            `• **Energy Consumed**: \`0 Energy (Free Tutorial)\`\n\n` +
            (tutFloorInfo ? `💡 **Tactical Lesson**: *${tutFloorInfo.guideMessage}*\n` : '') +
            logSection +
            `\n\n${completion.message}`,
        )
        .setFooter({ text: 'Clear Floor 1 of the seasonal tower next with /dungeon climb!' });

      await ctx.reply({ embeds: [embed] });
    } else {
      const nextFloorInfo = services.tutorialService.getTutorialFloor(tutorialFloor + 1);
      const embed = new EmbedBuilder()
        .setTitle(`🔰 Tutorial Floor T${tutorialFloor} CLEARED! — ${tutFloorInfo?.title ?? 'Victory'}`)
        .setColor(0x57f287)
        .setDescription(
          `**Dungeon Run Report: Floor T${tutorialFloor} [${tutFloorInfo?.topic ?? 'Tutorial'}]**\n` +
            `• **Outcome**: ✅ **VICTORY**\n` +
            `• **Turns Total**: \`${runResult.turnsTotal}/25 Turns\`\n` +
            `• **Energy Consumed**: \`0 Energy (Free Tutorial)\`\n\n` +
            (tutFloorInfo ? `💡 **Tactical Lesson**: *${tutFloorInfo.guideMessage}*\n` : '') +
            logSection +
            `\n\n⚔️ **Next Challenge**: **Floor T${tutorialFloor + 1} (${nextFloorInfo?.topic ?? 'Next Floor'})**\n` +
            `Run \`/dungeon climb\` or \`$climb\` to continue the tutorial!`,
        )
        .setFooter({ text: `Floor T${tutorialFloor}/4 Completed. 0 Energy cost.` });

      await ctx.reply({ embeds: [embed] });
    }
  } else {
    const embed = new EmbedBuilder()
      .setTitle(`💀 Tutorial Floor T${tutorialFloor} Defeat`)
      .setColor(0xed4245)
      .setDescription(
        `**Dungeon Run Report: Floor T${tutorialFloor} [${tutFloorInfo?.topic ?? 'Tutorial'}]**\n` +
          `• **Outcome**: ❌ **DEFEATED**\n` +
          `• **Turns Total**: \`${runResult.turnsTotal}/25 Turns\`\n\n` +
          (tutFloorInfo ? `💡 **Tactical Tip**: *${tutFloorInfo.guideMessage}*\n` : '') +
          logSection +
          `\n\nDon't give up! Retrying tutorial floors costs **0 Energy**.\nRun \`/dungeon climb\` or \`$climb\` to try again!`,
      )
      .setFooter({ text: "Tip: Counter the dummy's element or use active skills when MP is full!" });

    await ctx.reply({ embeds: [embed] });
  }
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

    const combatant: Combatant = {
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
    };

    const loadout = await services.loadoutService.getCardLoadout(uc.id);
    services.loadoutService.applyLoadoutToCombatant(combatant, loadout);

    combatants.push(combatant);
  }

  return combatants;
}
