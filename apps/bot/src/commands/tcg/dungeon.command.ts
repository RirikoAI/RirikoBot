import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ButtonInteraction,
  type Message,
} from 'discord.js';
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
import { DungeonBattleManager } from './dungeon-battle.manager.js';

const levelingEngine = new LevelingEngine();

export function createDungeonCommand(services: BotServices): Command {
  const battleManager = new DungeonBattleManager(services);

  return {
    metadata: {
      name: 'dungeon',
      category: CommandCategory.TCG,
      description: 'PvE Seasonal Dungeon Tower: Climb floors, challenge bosses, and overcome environmental affixes.',
      aliases: ['tower', 'climb', 'spire'],
      usage: '/dungeon [action: status|climb|floor|leaderboard|tutorial] [floor_number] [mode: manual|auto]',
      examples: [
        '/dungeon action:status',
        '/dungeon action:climb',
        '/dungeon action:climb mode:auto',
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
        {
          name: 'mode',
          description: 'Combat mode (manual: interactive tactical buttons, auto: watch real-time turns)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Manual (Tactical button controls)', value: 'manual' },
            { name: 'Auto (Watch real-time turn battle)', value: 'auto' },
          ],
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

          const climbBtn = new ButtonBuilder()
            .setCustomId('dungeon:status:climb')
            .setLabel(`⚔️ Climb Floor ${nextFloor}`)
            .setStyle(ButtonStyle.Success);
          const tutorialBtn = new ButtonBuilder()
            .setCustomId('dungeon:status:tutorial')
            .setLabel('🔰 Tutorial')
            .setStyle(ButtonStyle.Secondary);
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(climbBtn, tutorialBtn);

          const replyMsg = await ctx.reply({ embeds: [embed], components: [row] });
          const discordMsg = (
            replyMsg && typeof replyMsg === 'object' && 'fetch' in replyMsg
              ? await (replyMsg as any).fetch()
              : replyMsg
          ) as Message | undefined;
          if (discordMsg && typeof discordMsg === 'object' && 'createMessageComponentCollector' in discordMsg) {
            const collector = discordMsg.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 60_000,
            });
            collector.on('collect', async (interaction: ButtonInteraction) => {
              if (interaction.user.id !== ctx.user.id) {
                await interaction.reply({ content: '⏳ This is not your menu!', ephemeral: true });
                return;
              }
              collector.stop();
              if (interaction.customId === 'dungeon:status:climb') {
                await interaction.deferUpdate();
                await battleManager.startBattle(ctx, {
                  floorNumber: nextFloor,
                  seasonId: activeSeason.id,
                  mode: 'manual',
                });
              } else if (interaction.customId === 'dungeon:status:tutorial') {
                await interaction.deferUpdate();
                const tutProgress = await services.userDungeonProgressRepo.getOrCreateProgress(
                  ctx.user.id,
                  'season_tutorial',
                );
                await handleTutorialClimb(
                  ctx,
                  services,
                  Math.min(4, tutProgress.highestClearedFloor + 1),
                  'manual',
                );
              }
            });
          }
          break;
        }

        case 'climb': {
          const mode = (ctx.options.getString('mode')?.toLowerCase() as 'manual' | 'auto') ?? 'manual';

          // Tutorial Gate: ensure players clear Prologue Floors T1–T4 first
          const tutorialProgress = await services.userDungeonProgressRepo.getOrCreateProgress(
            ctx.user.id,
            'season_tutorial',
          );

          if (tutorialProgress.highestClearedFloor < 4) {
            const nextTutFloor = tutorialProgress.highestClearedFloor + 1;
            const embed = new EmbedBuilder()
              .setTitle('🔰 Prologue Tutorial Required')
              .setColor(0xfee75c)
              .setDescription(
                `⚠️ **You haven't finished the tutorial yet!**\n\n` +
                  `Master the fundamentals of Elemental Resonance, MP & Skills, Consumables, and Shield Wards before entering the seasonal tower.\n\n` +
                  `Begin **Tutorial Floor ${nextTutFloor} / 4**?`,
              )
              .setFooter({ text: 'Clear all 4 tutorial floors to unlock Season 1 tower climbing!' });

            const beginBtn = new ButtonBuilder()
              .setCustomId('dungeon:climb:begin_tutorial')
              .setLabel(`⚔️ Begin Tutorial Floor ${nextTutFloor} / 4`)
              .setStyle(ButtonStyle.Success);

            const cancelBtn = new ButtonBuilder()
              .setCustomId('dungeon:climb:cancel')
              .setLabel('❌ Cancel')
              .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(beginBtn, cancelBtn);

            const replyMsg = await ctx.reply({ embeds: [embed], components: [row] });
            const discordMsg = (
              replyMsg && typeof replyMsg === 'object' && 'fetch' in replyMsg
                ? await (replyMsg as any).fetch()
                : replyMsg
            ) as Message | undefined;

            if (discordMsg && typeof discordMsg === 'object' && 'createMessageComponentCollector' in discordMsg) {
              const collector = discordMsg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60_000,
              });

              collector.on('collect', async (interaction: ButtonInteraction) => {
                if (interaction.user.id !== ctx.user.id) {
                  await interaction.reply({ content: '⏳ This is not your menu!', ephemeral: true });
                  return;
                }
                collector.stop();
                if (interaction.customId === 'dungeon:climb:begin_tutorial') {
                  await interaction.deferUpdate();
                  await handleTutorialClimb(ctx, services, nextTutFloor, mode);
                } else if (interaction.customId === 'dungeon:climb:cancel') {
                  await interaction.update({
                    content: 'Tutorial postponed. You can resume anytime with `/dungeon tutorial` or `/dungeon climb`.',
                    embeds: [],
                    components: [],
                  });
                }
              });
            }
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

          await battleManager.startBattle(ctx, {
            floorNumber: floorToClimb,
            seasonId: activeSeason.id,
            mode,
            isTutorial: false,
          });
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
  mode: 'manual' | 'auto' = 'manual',
): Promise<void> {
  // 1. Ensure the player cannot replay cleared tutorial floors
  const canAttempt = await services.tutorialService.canAttemptTutorialFloor(ctx.user.id, tutorialFloor);
  let targetFloor = tutorialFloor;
  if (!canAttempt.allowed) {
    if (canAttempt.reason === 'ALREADY_CLEARED') {
      if (canAttempt.nextFloor && canAttempt.nextFloor <= 4) {
        targetFloor = canAttempt.nextFloor;
      } else {
        await ctx.reply({
          content:
            '🎉 You have already cleared all 4 floors of the Tutorial Prologue! Proceed to the seasonal tower with `/dungeon climb`.',
          ephemeral: true,
        });
        return;
      }
    } else if (canAttempt.reason === 'LOCKED') {
      targetFloor = canAttempt.nextFloor ?? 1;
    }
  }

  // 2. Ensure the player has their starter card
  await services.tutorialService.ensureStarterCard(ctx.user.id);

  // 3. For Floor T3 (Consumables), ensure the player has 1x HP and 1x MP potion
  if (targetFloor === 3) {
    await services.tutorialService.ensureFloor3Potions(ctx.user.id);
  }

  // 4. Launch interactive battle session for the tutorial floor
  const battleManager = new DungeonBattleManager(services);
  await battleManager.startBattle(ctx, {
    floorNumber: targetFloor,
    seasonId: 'season_tutorial',
    mode,
    isTutorial: true,
  });
}

