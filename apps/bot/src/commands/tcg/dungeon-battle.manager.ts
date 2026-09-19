import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type Message,
} from 'discord.js';
import type { CommandContext } from '@ririko/discord';
import {
  type DungeonBattleSession,
  type DungeonTurnState,
  type DungeonRunResult,
  type Floor4DefeatResult,
  formatCardExpResult,
} from '@ririko/services';
import type { BotServices } from '../../services.js';

export interface StartBattleOptions {
  floorNumber: number;
  seasonId: string;
  mode: 'manual' | 'auto';
  isTutorial?: boolean | undefined;
  existingMessage?: Message | undefined;
  interaction?: ButtonInteraction | undefined;
}

const CARD_IMAGE_NAME = 'player_card.png';

/**
 * Creates an ASCII/Unicode progress bar.
 * e.g., `[████████░░]`
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
 * Manages the interactive Discord real-time combat session for Dungeon Tower climbs.
 */
export class DungeonBattleManager {
  private readonly services: BotServices;

  constructor(services: BotServices) {
    this.services = services;
  }

  public async startBattle(ctx: CommandContext, options: StartBattleOptions): Promise<void> {
    const { floorNumber, seasonId, isTutorial } = options;

    // 1. Fetch user combat cards
    const userCards = await this.services.loadoutService.buildActiveParty(ctx.user.id, 'TEAM_A');
    if (userCards.length === 0) {
      await ctx.reply({
        content:
          '❌ You have no cards available to climb the dungeon! Claim or equip a card first with `/card claim` or `/card equip`.',
        ephemeral: true,
      });
      return;
    }

    const activeCombatant = userCards[0]!;

    // 2. Fetch base card & asset to render real card image
    let baseCardId = activeCombatant.id;
    if (typeof this.services.waifuCardRepo.findUserCardById === 'function') {
      const userCardRow = await this.services.waifuCardRepo.findUserCardById(activeCombatant.id);
      if (userCardRow) baseCardId = userCardRow.cardId;
    }
    const baseCard = typeof this.services.waifuCardRepo.findById === 'function'
      ? await this.services.waifuCardRepo.findById(baseCardId)
      : null;

    let cardPngBuffer: Buffer | null = null;
    if (baseCard && this.services.cardImageService) {
      try {
        const asset =
          baseCard.assetId && this.services.waifuAssetRepo
            ? await this.services.waifuAssetRepo.findById(baseCard.assetId)
            : null;
        const totalCards =
          typeof this.services.waifuCardRepo.count === 'function'
            ? await this.services.waifuCardRepo.count()
            : 0;

        cardPngBuffer = await this.services.cardImageService.getCardImage(baseCard, asset, {
          attributionText: 'Ririko AI 2.0 Waifu TCG',
          maxCollectionNumber: totalCards,
        });
      } catch (err) {
        console.warn(`[dungeon-battle] Failed to render card image for ${baseCard.id}:`, err);
      }
    }

    // 3. Create DungeonBattleSession via DungeonRunner
    const sessionResult = await this.services.dungeonRunner.createBattleSession({
      userId: ctx.user.id,
      seasonId,
      floorNumber,
      playerParty: userCards,
      skipEnergyDeduction: Boolean(isTutorial),
    });

    if (!sessionResult.success || !sessionResult.session) {
      await ctx.reply({
        content: `❌ **Climb Failed**: ${sessionResult.error ?? 'Unable to start dungeon session.'}`,
        ephemeral: true,
      });
      return;
    }

    const session = sessionResult.session;
    let currentMode: 'manual' | 'auto' = options.mode;
    let isAutoLoopRunning = false;
    let abortAuto = false;

    // 4. Build initial embed & components
    const userPotions = await this.fetchUserPotions(ctx.user.id);
    const initialSnapshot = session.getSnapshot();
    const initialEmbed = this.buildBattleEmbed(session, initialSnapshot, Boolean(cardPngBuffer));
    const initialRows = this.buildActionRows(initialSnapshot, currentMode, userPotions);

    let discordMsg: Message | undefined;

    if (options.interaction && !options.interaction.replied && !options.interaction.deferred) {
      await options.interaction.deferUpdate().catch(() => {});
    }

    if (options.existingMessage) {
      await options.existingMessage.edit({
        embeds: [initialEmbed],
        components: initialRows,
        files: cardPngBuffer ? [{ attachment: cardPngBuffer, name: CARD_IMAGE_NAME }] : [],
      });
      discordMsg = options.existingMessage;
    } else {
      const replyMsg = await ctx.reply({
        embeds: [initialEmbed],
        components: initialRows,
        files: cardPngBuffer ? [{ attachment: cardPngBuffer, name: CARD_IMAGE_NAME }] : [],
      });
      discordMsg = (
        replyMsg && typeof replyMsg === 'object' && 'fetch' in replyMsg
          ? await (replyMsg as any).fetch()
          : replyMsg
      ) as Message | undefined;
    }

    if (!discordMsg || typeof discordMsg !== 'object' || !('createMessageComponentCollector' in discordMsg)) {
      return;
    }

    const collector = discordMsg.createMessageComponentCollector({
      time: 180_000, // 3 minutes total game limit
    });

    // Helper: Finalizes the battle in DB and updates UI with victory/defeat screen
    const finalizeBattle = async (
      interaction?: ButtonInteraction | StringSelectMenuInteraction,
    ): Promise<DungeonRunResult> => {
      const runResult = await this.services.dungeonRunner.finalizeBattleResult(session, {
        energySpent: sessionResult.energySpent,
      });

      let tutorialCompletionMsg: string | undefined;
      let floor4DefeatResult: Floor4DefeatResult | undefined;

      if (isTutorial && runResult.victory && floorNumber >= 4) {
        const completion = await this.services.tutorialService.completeTutorial(ctx.user.id);
        tutorialCompletionMsg = completion.message;
      } else if (isTutorial && runResult.victory && floorNumber === 3 && this.services.tutorialService) {
        const f3Reward = await this.services.tutorialService.handleTutorialFloor3Victory(ctx.user.id);
        if (f3Reward.granted && f3Reward.message) {
          tutorialCompletionMsg = f3Reward.message;
        }
      } else if (isTutorial && !runResult.victory && floorNumber === 4 && this.services.tutorialService) {
        floor4DefeatResult = await this.services.tutorialService.handleTutorialFloor4Defeat(
          ctx.user.id,
          session.getSnapshot().boss.element as any,
        );
      }

      const finalSnapshot = session.getSnapshot();
      const finalEmbed = this.buildBattleEmbed(
        session,
        finalSnapshot,
        Boolean(cardPngBuffer),
        runResult,
        tutorialCompletionMsg,
        floor4DefeatResult,
      );
      const postRows = this.buildPostBattleRows(
        session,
        finalSnapshot.winner === 'TEAM_A',
        floor4DefeatResult,
        Boolean(isTutorial),
      );

      if (interaction) {
        await interaction.update({ embeds: [finalEmbed], components: postRows }).catch(() => {});
      } else {
        await discordMsg.edit({ embeds: [finalEmbed], components: postRows }).catch(() => {});
      }

      return runResult;
    };

    // Helper: Runs automated turns step-by-step with real-time delay
    const runAutoLoop = async (): Promise<void> => {
      if (isAutoLoopRunning) return;
      isAutoLoopRunning = true;
      abortAuto = false;

      while (!session.getSnapshot().isFinished && !abortAuto) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (abortAuto || session.getSnapshot().isFinished) break;

        const nextSnapshot = session.executeAutoTurn();

        if (nextSnapshot.isFinished) {
          await finalizeBattle();
          break;
        } else {
          const currentPotions = await this.fetchUserPotions(ctx.user.id);
          const updatedEmbed = this.buildBattleEmbed(session, nextSnapshot, Boolean(cardPngBuffer));
          const updatedRows = this.buildActionRows(nextSnapshot, 'auto', currentPotions);
          await discordMsg
            .edit({ embeds: [updatedEmbed], components: updatedRows })
            .catch(() => {});
        }
      }

      isAutoLoopRunning = false;
    };

    // If starting in auto mode, start loop
    if (currentMode === 'auto') {
      void runAutoLoop();
    }

    // 5. Interaction Collector Events
    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== ctx.user.id) {
        await interaction.reply({
          content: '⏳ This is not your dungeon battle!',
          ephemeral: true,
        });
        return;
      }

      const customId = interaction.customId;

      // Handle String Select Menu (In-Combat Items)
      if (interaction.isStringSelectMenu() && customId === 'dungeon:action:use_item') {
        const selectedId = interaction.values[0];
        if (!selectedId || selectedId === 'none' || selectedId === 'already_used') {
          await interaction.deferUpdate().catch(() => {});
          return;
        }

        if (session.getSnapshot().potionUsedThisTurn) {
          await interaction.reply({
            content: '⚠️ You can only use 1 potion per turn! Complete your turn with Attack, Skill, or Defend first.',
            ephemeral: true,
          });
          return;
        }

        const invItem = await this.services.userInventoryItemRepo.findById(selectedId);
        if (!invItem || invItem.userId !== ctx.user.id || invItem.quantity <= 0) {
          await interaction.reply({
            content: '❌ That potion is no longer available in your inventory!',
            ephemeral: true,
          });
          return;
        }

        const gameItem = await this.services.gameItemRepo.findById(invItem.itemId);
        if (!gameItem) {
          await interaction.reply({
            content: '❌ Item definition not found.',
            ephemeral: true,
          });
          return;
        }

        // Deduct 1 from inventory
        if (invItem.quantity <= 1) {
          await this.services.userInventoryItemRepo.delete(invItem.id);
        } else {
          await this.services.userInventoryItemRepo.update(invItem.id, {
            quantity: invItem.quantity - 1,
          });
        }

        // Execute item turn in battle session
        const nextSnapshot = session.executeItemTurn(gameItem);

        if (nextSnapshot.isFinished) {
          await finalizeBattle(interaction);
        } else {
          const updatedPotions = await this.fetchUserPotions(ctx.user.id);
          const embed = this.buildBattleEmbed(session, nextSnapshot, Boolean(cardPngBuffer));
          const rows = this.buildActionRows(nextSnapshot, 'manual', updatedPotions);
          await interaction.update({ embeds: [embed], components: rows }).catch(() => {});
        }
        return;
      }

      if (!interaction.isButton()) {
        await interaction.deferUpdate().catch(() => {});
        return;
      }

      // Handle Post-Battle Navigation
      if (customId === 'dungeon:action:enter_season_1') {
        collector.stop('restarting');
        const activeSeason = (await this.services.dungeonSeasonRepo.findActiveSeason()) ?? {
          id: 's1_infernal_crucible',
          name: 'Season 1: Infernal Crucible',
        };
        const progress = await this.services.userDungeonProgressRepo.getOrCreateProgress(
          ctx.user.id,
          activeSeason.id,
        );
        const nextFloor = progress.highestClearedFloor + 1;
        await this.startBattle(ctx, {
          floorNumber: nextFloor,
          seasonId: activeSeason.id,
          mode: currentMode,
          isTutorial: false,
          existingMessage: discordMsg,
          interaction,
        });
        return;
      }

      if (customId === 'dungeon:action:next') {
        collector.stop('restarting');
        if (isTutorial && floorNumber >= 4) {
          const activeSeason = (await this.services.dungeonSeasonRepo.findActiveSeason()) ?? {
            id: 's1_infernal_crucible',
            name: 'Season 1: Infernal Crucible',
          };
          const progress = await this.services.userDungeonProgressRepo.getOrCreateProgress(
            ctx.user.id,
            activeSeason.id,
          );
          await this.startBattle(ctx, {
            floorNumber: progress.highestClearedFloor + 1,
            seasonId: activeSeason.id,
            mode: currentMode,
            isTutorial: false,
            existingMessage: discordMsg,
            interaction,
          });
          return;
        }
        await this.startBattle(ctx, {
          floorNumber: floorNumber + 1,
          seasonId,
          mode: currentMode,
          isTutorial,
          existingMessage: discordMsg,
          interaction,
        });
        return;
      }

      if (customId === 'dungeon:action:retry') {
        collector.stop('restarting');
        await this.startBattle(ctx, {
          floorNumber,
          seasonId,
          mode: currentMode,
          isTutorial,
          existingMessage: discordMsg,
          interaction,
        });
        return;
      }

      if (customId.startsWith('dungeon:action:equip_retry:')) {
        const userCardId = customId.split(':')[3];
        if (userCardId && this.services.waifuCardRepo) {
          const equipped = await this.services.waifuCardRepo.listUserCards(ctx.user.id, { state: 'EQUIPPED' });
          for (const eqCard of equipped) {
            await this.services.waifuCardRepo.updateUserCardState(eqCard.id, 'IDLE');
          }
          await this.services.waifuCardRepo.updateUserCardState(userCardId, 'EQUIPPED');
        }
        collector.stop('restarting');
        await this.startBattle(ctx, {
          floorNumber,
          seasonId,
          mode: currentMode,
          isTutorial,
          existingMessage: discordMsg,
          interaction,
        });
        return;
      }

      if (customId === 'dungeon:action:status') {
        await interaction.reply({
          content: 'ℹ️ Use `/dungeon status` or `$tower` to inspect full seasonal tower standing.',
          ephemeral: true,
        });
        return;
      }

      // Handle In-Combat Actions
      if (customId === 'dungeon:action:flee') {
        session.forfeit();
        await finalizeBattle(interaction);
        return;
      }

      if (customId === 'dungeon:action:skip') {
        abortAuto = true;
        // Fast-forward turns to completion
        while (!session.getSnapshot().isFinished) {
          session.executeAutoTurn();
        }
        await finalizeBattle(interaction);
        return;
      }

      if (customId === 'dungeon:action:pause') {
        abortAuto = true;
        currentMode = 'manual';
        const snap = session.getSnapshot();
        const currentPotions = await this.fetchUserPotions(ctx.user.id);
        const embed = this.buildBattleEmbed(session, snap, Boolean(cardPngBuffer));
        const rows = this.buildActionRows(snap, 'manual', currentPotions);
        await interaction.update({ embeds: [embed], components: rows }).catch(() => {});
        return;
      }

      if (customId === 'dungeon:action:auto') {
        currentMode = 'auto';
        const snap = session.getSnapshot();
        const currentPotions = await this.fetchUserPotions(ctx.user.id);
        const embed = this.buildBattleEmbed(session, snap, Boolean(cardPngBuffer));
        const rows = this.buildActionRows(snap, 'auto', currentPotions);
        await interaction.update({ embeds: [embed], components: rows }).catch(() => {});
        void runAutoLoop();
        return;
      }

      // Manual combat actions
      let chosenAction: 'ATTACK' | 'SKILL' | 'DEFEND' | null = null;
      if (customId === 'dungeon:action:attack') chosenAction = 'ATTACK';
      else if (customId === 'dungeon:action:skill') chosenAction = 'SKILL';
      else if (customId === 'dungeon:action:defend') chosenAction = 'DEFEND';

      if (!chosenAction) {
        await interaction.deferUpdate().catch(() => {});
        return;
      }

      const nextSnapshot = session.executeTurn(chosenAction);

      if (nextSnapshot.isFinished) {
        await finalizeBattle(interaction);
      } else {
        const currentPotions = await this.fetchUserPotions(ctx.user.id);
        const embed = this.buildBattleEmbed(session, nextSnapshot, Boolean(cardPngBuffer));
        const rows = this.buildActionRows(nextSnapshot, 'manual', currentPotions);
        await interaction.update({ embeds: [embed], components: rows }).catch(() => {});
      }
    });

    // Inactivity Safeguard: Auto-resolve if user abandons
    collector.on('end', async (_, reason) => {
      if (reason === 'battle_finished' || reason === 'restarting') return;

      if (!session.getSnapshot().isFinished) {
        while (!session.getSnapshot().isFinished) {
          session.executeAutoTurn();
        }
        await finalizeBattle();
      }
    });
  }

  // --- Embed & Component Rendering ---

  private buildBattleEmbed(
    session: DungeonBattleSession,
    state: DungeonTurnState,
    hasCardImage: boolean,
    runResult?: DungeonRunResult | undefined,
    tutorialCompletionMsg?: string | undefined,
    floor4Defeat?: Floor4DefeatResult | undefined,
  ): EmbedBuilder {
    const { player, boss, ward, turn, maxTurns, isFinished, winner } = state;
    const isVictory = isFinished && winner === 'TEAM_A';
    const isDefeat = isFinished && winner === 'TEAM_B';

    const isTutorial = session.seasonId.toLowerCase().includes('tutorial');
    const tutFloorInfo =
      isTutorial && this.services.tutorialService
        ? this.services.tutorialService.getTutorialFloor(session.floorNumber)
        : null;

    const embed = new EmbedBuilder();

    // Color: Green on victory, Red on defeat, themed otherwise
    if (isVictory) embed.setColor(0x57f287);
    else if (isDefeat) embed.setColor(0xed4245);
    else embed.setColor(0xff4500);

    // Title
    if (isVictory) {
      embed.setTitle(
        isTutorial
          ? session.floorNumber >= 4
            ? '🎉 Prologue Tutorial CLEARED! — Training Grounds Mastered!'
            : `🔰 Tutorial Floor T${session.floorNumber} CLEARED! — ${tutFloorInfo?.title ?? 'Victory'}`
          : `🏆 Floor ${session.floorNumber} CLEARED! — Victory!`,
      );
    } else if (isDefeat) {
      embed.setTitle(
        isTutorial
          ? `💀 Tutorial Floor T${session.floorNumber} Defeat`
          : `💀 Floor ${session.floorNumber} Defeat`,
      );
    } else {
      embed.setTitle(
        isTutorial
          ? `🔰 Tutorial Floor T${session.floorNumber} [${tutFloorInfo?.topic ?? 'Training'}] — ${boss.name} vs ${player.name} (Turn ${turn}/${maxTurns})`
          : `🏰 Floor ${session.floorNumber} — ${boss.name} vs ${player.name} (Turn ${turn}/${maxTurns})`,
      );
    }

    // Health & MP Bars
    const playerHpBar = renderProgressBar(player.currentHealth, player.maxHealth, 10);
    const playerMpBar = renderProgressBar(player.currentMp, player.maxMp, 10);
    const bossHpBar = renderProgressBar(boss.currentHealth, boss.maxHealth, 10);

    let bossWardText = '';
    if (ward && ward.active) {
      const wardBar = renderProgressBar(ward.currentHealth, ward.maxHealth, 8);
      bossWardText = `\n🛡️ **Ward Layer [${ward.element ?? 'BARRIER'}]:** \`${wardBar}\` **${ward.currentHealth}/${ward.maxHealth} HP**`;
    }

    const playerStatusText =
      player.statusEffects.length > 0
        ? `\n✨ **Buffs/Debuffs:** ` +
          player.statusEffects.map((e) => `\`${e.type} (${e.duration}t)\``).join(' ')
        : '';

    const bossStatusText =
      boss.statusEffects.length > 0
        ? `\n⚠️ **Status Effects:** ` +
          boss.statusEffects.map((e) => `\`${e.type} (${e.duration}t)\``).join(' ')
        : '';

    const playerGuardText = state.defendingThisTurn ? ' 🛡️ *(Guarding — 50% dmg reduction)*' : '';

    // Turn Combat Logs (show last 4 logs)
    const highlightLogs =
      state.lastTurnLogs.length > 0 ? state.lastTurnLogs : state.allLogs.slice(-4);
    const logSection =
      highlightLogs.length > 0
        ? `\n\n**⚔️ Combat Feed:**\n` +
          highlightLogs.map((l) => `• Turn ${l.turn || turn}: ${l.message}`).join('\n')
        : '';

    const resultBanner = runResult
      ? `**Dungeon Run Report: Floor ${isTutorial ? `T${session.floorNumber}` : session.floorNumber}**\n` +
        `• **Outcome**: ${runResult.victory ? '✅ **VICTORY**' : '❌ **DEFEATED**'}\n` +
        `• **Turns Total**: \`${runResult.turnsTotal}/${maxTurns} Turns\`\n` +
        `• **Energy Consumed**: \`${runResult.energySpent} Energy\`\n\n`
      : '';

    const tutorialLessonText = tutFloorInfo
      ? `💡 **Tactical Lesson**: *${tutFloorInfo.guideMessage}*\n\n`
      : '';

    const floor4Lesson = floor4Defeat
      ? `\n\n💡 **Tactical Lesson: Type Disadvantage & Elemental Wards!**\n` +
        `Your vanguard suffered type disadvantage against the **[${floor4Defeat.bossElement}]** boss, and attacks with non-matching elements deal ZERO damage to the Elemental Ward!\n` +
        (floor4Defeat.counterCard
          ? `🎁 **Counter Reinforcement ${floor4Defeat.isNewGrant ? 'Dispatched' : 'Ready'}**: **${floor4Defeat.counterCard.name} [${floor4Defeat.bossElement}]**!\n` +
            `Equip this card with \`/card equip\` or click **[⚔️ Equip & Retry]** to break the ward, defeat the boss, and enter Season 1!`
          : `Equip a **[${floor4Defeat.bossElement}]** card to break the boss's ward!`)
      : '';

    const lootSection = runResult?.loot ? `\n\n${runResult.loot.message}` : '';
    const cardExpSection = runResult?.cardExp.length
      ? `\n${runResult.cardExp.map(formatCardExpResult).join('\n')}`
      : '';
    const tutorialSection = tutorialCompletionMsg ? `\n\n${tutorialCompletionMsg}` : '';

    embed.setDescription(
      resultBanner +
        tutorialLessonText +
        `**🧙‍♀️ ${player.name}** [${player.element}]${playerGuardText}\n` +
        `❤️ **HP:** \`${playerHpBar}\` **${player.currentHealth.toLocaleString()} / ${player.maxHealth.toLocaleString()}**\n` +
        `🔷 **MP:** \`${playerMpBar}\` **${player.currentMp} / ${player.maxMp}**` +
        playerStatusText +
        `\n\n` +
        `**👹 ${boss.name}** [${boss.element}]\n` +
        `❤️ **HP:** \`${bossHpBar}\` **${boss.currentHealth.toLocaleString()} / ${boss.maxHealth.toLocaleString()}**` +
        bossWardText +
        bossStatusText +
        logSection +
        lootSection +
        cardExpSection +
        tutorialSection +
        floor4Lesson,
    );

    if (hasCardImage) {
      embed.setImage(`attachment://${CARD_IMAGE_NAME}`);
    }

    if (isVictory) {
      if (isTutorial && session.floorNumber >= 4) {
        embed.setFooter({
          text: '🎉 Tutorial Graduated! Click "Enter Season 1" below to start the seasonal tower!',
        });
      } else {
        embed.setFooter({ text: 'Proceed to the next floor with /dungeon climb or click Next Floor!' });
      }
    } else if (isDefeat) {
      embed.setFooter({
        text: 'Tip: Counter enemy elements, enhance equipment, or time your skills wisely!',
      });
    } else {
      embed.setFooter({
        text: `Floor ${session.floorNumber} | Manual actions or click Auto to watch in real-time.`,
      });
    }

    return embed;
  }

  private buildActionRows(
    state: DungeonTurnState,
    mode: 'manual' | 'auto',
    availablePotions: {
      id: string;
      itemId: string;
      name: string;
      subtype: string;
      quantity: number;
      description?: string;
    }[] = [],
  ): ActionRowBuilder<any>[] {
    const { player } = state;
    const canUseSkill =
      player.currentMp >= player.skillManaCost && Boolean(player.skillName);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>();

    if (mode === 'auto') {
      buttonRow.addComponents(
        new ButtonBuilder()
          .setCustomId('dungeon:action:pause')
          .setLabel('⏸️ Pause Auto')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('dungeon:action:skip')
          .setLabel('⏩ Skip to End')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('dungeon:action:flee')
          .setLabel('🏳️ Forfeit')
          .setStyle(ButtonStyle.Danger),
      );
      return [buttonRow];
    }

    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId('dungeon:action:attack')
        .setLabel('⚔️ Attack (+15 MP)')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('dungeon:action:skill')
        .setLabel(
          `✨ ${player.skillName ?? 'Skill'} (${player.skillManaCost} MP)`,
        )
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canUseSkill),
      new ButtonBuilder()
        .setCustomId('dungeon:action:defend')
        .setLabel('🛡️ Defend (+10 MP)')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('dungeon:action:auto')
        .setLabel('⚡ Auto')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('dungeon:action:flee')
        .setLabel('🏳️ Forfeit')
        .setStyle(ButtonStyle.Danger),
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('dungeon:action:use_item');

    if (state.potionUsedThisTurn) {
      selectMenu.setPlaceholder('🧪 Potion already used this turn!');
      selectMenu.addOptions({
        label: '⏳ Potion Limit Reached',
        description: '1 potion per turn. Take an action (Attack/Skill/Defend) first!',
        value: 'already_used',
      });
      selectMenu.setDisabled(true);
    } else {
      selectMenu.setPlaceholder('🧪 Use Potion (Free Action — 1 per turn)...');
      if (availablePotions.length > 0) {
        for (const pot of availablePotions.slice(0, 25)) {
          const isHp = pot.subtype === 'HP_POTION';
          const icon = isHp ? '🧪' : '🔷';
          selectMenu.addOptions({
            label: `${icon} ${pot.name} (x${pot.quantity})`,
            description: pot.description
              ? pot.description.slice(0, 100)
              : isHp
                ? 'Restores HP (Free Action)'
                : 'Restores MP (Free Action)',
            value: pot.id,
          });
        }
      } else {
        selectMenu.addOptions({
          label: '🎒 No Potions in Inventory',
          description: 'Acquire HP & MP Potions at the Town Shop (/game shop)!',
          value: 'none',
        });
        selectMenu.setDisabled(true);
      }
    }

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    return [buttonRow, selectRow];
  }

  private buildPostBattleRows(
    session: DungeonBattleSession,
    isVictory: boolean,
    floor4Defeat?: Floor4DefeatResult | undefined,
    isTutorial?: boolean | undefined,
  ): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>();
    const isTut = Boolean(isTutorial ?? session.isTutorial);

    if (isVictory) {
      if (isTut && session.floorNumber >= 4) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId('dungeon:action:enter_season_1')
            .setLabel('🏰 Enter Season 1 (Floor 1)')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('dungeon:action:status')
            .setLabel('🏰 Tower Status')
            .setStyle(ButtonStyle.Secondary),
        );
      } else {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId('dungeon:action:next')
            .setLabel(`⚔️ Next Floor (Floor ${session.floorNumber + 1})`)
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('dungeon:action:status')
            .setLabel('🏰 Tower Status')
            .setStyle(ButtonStyle.Secondary),
        );
      }
    } else {
      if (floor4Defeat?.userCard && !floor4Defeat.alreadyEquipped) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`dungeon:action:equip_retry:${floor4Defeat.userCard.id}`)
            .setLabel(`⚔️ Equip ${floor4Defeat.counterCard?.name ?? 'Card'} & Retry`)
            .setStyle(ButtonStyle.Success),
        );
      }
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('dungeon:action:retry')
          .setLabel(`🔄 Retry Floor ${session.floorNumber}`)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('dungeon:action:status')
          .setLabel('🏰 Tower Status')
          .setStyle(ButtonStyle.Secondary),
      );
    }

    return [row];
  }

  private async fetchUserPotions(userId: string): Promise<
    {
      id: string;
      itemId: string;
      name: string;
      subtype: string;
      quantity: number;
      description?: string;
    }[]
  > {
    if (!this.services.userInventoryItemRepo || !this.services.gameItemRepo) {
      return [];
    }
    const inventory = await this.services.userInventoryItemRepo.findByUser(userId, { state: 'IDLE' });
    const potions: {
      id: string;
      itemId: string;
      name: string;
      subtype: string;
      quantity: number;
      description?: string;
    }[] = [];

    for (const slot of inventory) {
      if (slot.quantity <= 0) continue;
      const def = await this.services.gameItemRepo.findById(slot.itemId);
      if (!def) continue;
      if (def.type === 'CONSUMABLE' && (def.subtype === 'HP_POTION' || def.subtype === 'MANA_POTION')) {
        potions.push({
          id: slot.id,
          itemId: def.id,
          name: def.name,
          subtype: def.subtype,
          quantity: slot.quantity,
          description: def.description ?? undefined,
        });
      }
    }
    return potions;
  }
}
