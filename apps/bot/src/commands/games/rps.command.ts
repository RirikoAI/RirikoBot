import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type Message,
  type ButtonInteraction,
} from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';
import type { RpsChoice } from '@ririko/services';

export function buildRpsButtons(sessionId: string, disabled: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rps:choose:${sessionId}:ROCK`)
      .setLabel('Rock')
      .setEmoji('🪨')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`rps:choose:${sessionId}:PAPER`)
      .setLabel('Paper')
      .setEmoji('📄')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`rps:choose:${sessionId}:SCISSORS`)
      .setLabel('Scissors')
      .setEmoji('✂️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
  return [row];
}

const CHOICE_EMOJIS: Record<RpsChoice, string> = {
  ROCK: '🪨 Rock',
  PAPER: '📄 Paper',
  SCISSORS: '✂️ Scissors',
};

export function createRpsCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'rps',
      category: CommandCategory.GAMES,
      description: 'Play Rock-Paper-Scissors secretly with interactive buttons against AI or a friend',
      usage: '/rps [opponent:@user] [wager:credits]',
      examples: [
        '/rps',
        '/rps opponent:@friend wager:100',
        '!rps rock',
        '!rps @friend 50',
      ],
      aliases: ['rock-paper-scissors'],
      cooldownSeconds: 5,
      options: [
        {
          name: 'opponent',
          description: 'The user to challenge (defaults to Ririko AI if omitted)',
          type: 'USER',
          required: false,
        },
        {
          name: 'wager',
          description: 'Optional amount of credits to wager',
          type: 'INTEGER',
          required: false,
          minValue: 1,
        },
      ],
    },

    execute: async (ctx: CommandContext) => {
      const guildId = ctx.guild?.id ?? 'global';
      const channelId = ctx.channelId;
      const challenger = ctx.user;

      let opponentUser = await ctx.options.getUser('opponent');
      let wagerAmount = ctx.options.getInteger('wager') ?? undefined;
      let instantPrefixChoice: RpsChoice | undefined;

      // Prefix argument parsing fallback
      const rawArgs = ctx.options.getRawArgs();
      if (rawArgs && rawArgs.length > 0) {
        const firstArg = rawArgs[0]?.trim().toUpperCase();
        if (firstArg === 'ROCK' || firstArg === 'PAPER' || firstArg === 'SCISSORS') {
          instantPrefixChoice = firstArg as RpsChoice;
          if (rawArgs[1] && !isNaN(parseInt(rawArgs[1], 10))) {
            wagerAmount = Math.max(1, parseInt(rawArgs[1], 10));
          }
        } else {
          const mentionMatch = rawArgs[0]?.trim().match(/^<@!?(\d+)>$/);
          if (mentionMatch) {
            opponentUser = ctx.client.users.cache.get(mentionMatch[1]!) ?? null;
          }
          if (rawArgs[1] && !isNaN(parseInt(rawArgs[1], 10))) {
            wagerAmount = Math.max(1, parseInt(rawArgs[1], 10));
          }
        }
      }

      const isVsAi = !opponentUser || opponentUser.id === ctx.client.user?.id || opponentUser.bot;

      if (!isVsAi && opponentUser && opponentUser.id === challenger.id) {
        await ctx.reply({
          content: '❌ You cannot challenge yourself to Rock-Paper-Scissors!',
          ephemeral: true,
        });
        return;
      }

      const player1 = { id: challenger.id, username: challenger.username };
      const player2 = {
        id: isVsAi || !opponentUser ? 'ai' : opponentUser.id,
        username: isVsAi || !opponentUser ? 'Ririko AI' : opponentUser.username,
        isAi: isVsAi,
      };

      // Concurrency check
      if (services.gameSessionManager.isPlayerActiveInChannel(player1.id, channelId)) {
        await ctx.reply({
          content: '❌ You already have an active game in this channel! Please finish it first.',
          ephemeral: true,
        });
        return;
      }

      if (!isVsAi && services.gameSessionManager.isPlayerActiveInChannel(player2.id, channelId)) {
        await ctx.reply({
          content: `❌ <@${player2.id}> already has an active game in this channel!`,
          ephemeral: true,
        });
        return;
      }

      // Escrow wagers
      if (wagerAmount && wagerAmount > 0) {
        const escrowResult = await services.gameEscrowService.escrowWagers(
          guildId,
          [player1, player2],
          wagerAmount,
        );

        if (!escrowResult.success) {
          await ctx.reply({
            content: `❌ Wager Escrow Failed: ${escrowResult.error}`,
            ephemeral: true,
          });
          return;
        }
      }

      // Create session
      const session = services.rpsEngine.createGame({
        guildId,
        channelId,
        player1,
        player2,
        wagerAmount,
      });

      // If user invoked via prefix with instant choice e.g. `!rps rock`, submit immediately
      if (instantPrefixChoice && isVsAi) {
        const sub = services.rpsEngine.submitChoice(session.id, player1.id, instantPrefixChoice);
        const aiChoice = sub.session.metadata.submissions['ai']!;
        const winnerId = sub.session.winnerId;

        let desc =
          `**${player1.username}** chose ${CHOICE_EMOJIS[instantPrefixChoice]}\n` +
          `**Ririko AI** chose ${CHOICE_EMOJIS[aiChoice]}\n\n`;

        if (winnerId === player1.id) {
          desc += `🏆 **You won!**`;
          if (wagerAmount) {
            await services.gameEscrowService.settleWagers({
              guildId,
              players: [player1, player2],
              winnerId: player1.id,
              isTie: false,
              amount: wagerAmount,
            });
            desc += ` You won **${(wagerAmount * 2).toLocaleString()} credits**!`;
          }
        } else if (winnerId === 'ai') {
          desc += `😢 **Ririko won!**`;
          if (wagerAmount) {
            desc += ` You lost your wager of **${wagerAmount.toLocaleString()} credits**.`;
          }
        } else {
          desc += `🤝 **It's a tie!**`;
          if (wagerAmount) {
            await services.gameEscrowService.settleWagers({
              guildId,
              players: [player1, player2],
              winnerId: null,
              isTie: true,
              amount: wagerAmount,
            });
            desc += ` Wagers refunded.`;
          }
        }

        const embed = new EmbedBuilder()
          .setTitle('✂️ Rock-Paper-Scissors')
          .setDescription(desc)
          .setColor(winnerId === player1.id ? '#57F287' : winnerId === 'ai' ? '#ED4245' : '#FEE75C');

        await ctx.reply({ embeds: [embed] });
        return;
      }

      // Standard interactive mode
      const buttons = buildRpsButtons(session.id, false);

      const embed = new EmbedBuilder()
        .setTitle('✂️ Rock-Paper-Scissors')
        .setDescription(
          `**${player1.username}** vs **${player2.username}**\n` +
          `${wagerAmount ? `💰 **Wager**: ${wagerAmount.toLocaleString()} credits each\n` : ''}` +
          `\n**Status**:\n` +
          `• ${player1.username}: Thinking 🤔\n` +
          `• ${player2.username}: ${isVsAi ? 'Ready ✅' : 'Thinking 🤔'}\n\n` +
          `Click a button below to submit your secret choice (60s limit). Choices remain hidden until both players choose!`,
        )
        .setColor('#5865F2');

      const replyMsg = await ctx.reply({
        embeds: [embed],
        components: buttons,
      });

      const discordMsg = (
        'fetch' in replyMsg ? await (replyMsg as any).fetch() : replyMsg
      ) as Message;

      if (!discordMsg || !('createMessageComponentCollector' in discordMsg)) {
        return;
      }

      const collector = discordMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000,
      });

      collector.on('collect', async (interaction: ButtonInteraction) => {
        const customId = interaction.customId;
        if (!customId.startsWith(`rps:choose:${session.id}:`)) return;

        const choice = customId.split(':')[3] as RpsChoice;
        const userId = interaction.user.id;

        if (userId !== player1.id && userId !== player2.id) {
          await interaction.reply({
            content: '❌ You are not a participant in this Rock-Paper-Scissors match!',
            ephemeral: true,
          });
          return;
        }

        try {
          const submitResult = services.rpsEngine.submitChoice(session.id, userId, choice);
          await interaction.reply({
            content: `🤫 You picked **${CHOICE_EMOJIS[choice]}**! Your choice is hidden until both players have chosen.`,
            ephemeral: true,
          });

          const currentSession = submitResult.session;

          if (submitResult.bothSubmitted) {
            // Both have chosen -> reveal!
            const p1Choice = currentSession.metadata.submissions[player1.id]!;
            const p2Choice = currentSession.metadata.submissions[player2.id]!;
            const winnerId = currentSession.winnerId;

            let resultText =
              `• **${player1.username}** chose **${CHOICE_EMOJIS[p1Choice]}**\n` +
              `• **${player2.username}** chose **${CHOICE_EMOJIS[p2Choice]}**\n\n`;

            if (currentSession.state === 'COMPLETED' && winnerId) {
              const winner = currentSession.players.find((p: any) => p.id === winnerId);
              resultText += `🏆 **Winner**: <@${winnerId}> (${winner?.username}) wins!\n`;

              if (wagerAmount) {
                await services.gameEscrowService.settleWagers({
                  guildId,
                  players: [player1, player2],
                  winnerId,
                  isTie: false,
                  amount: wagerAmount,
                });
                resultText += `🎉 Pot of **${(wagerAmount * 2).toLocaleString()} credits** awarded to <@${winnerId}>!`;
              }
            } else {
              resultText += `🤝 **Result**: It's a tie!\n`;
              if (wagerAmount) {
                await services.gameEscrowService.settleWagers({
                  guildId,
                  players: [player1, player2],
                  winnerId: null,
                  isTie: true,
                  amount: wagerAmount,
                });
                resultText += `💰 Wagers refunded to both players.`;
              }
            }

            const finalEmbed = new EmbedBuilder()
              .setTitle('✂️ Rock-Paper-Scissors — Game Over')
              .setDescription(resultText)
              .setColor(winnerId ? '#57F287' : '#FEE75C');

            const disabledButtons = buildRpsButtons(session.id, true);
            await discordMsg.edit({ embeds: [finalEmbed], components: disabledButtons }).catch(() => null);
            collector.stop('game_over');
          } else {
            // Update status showing who has submitted
            const p1Submitted = !!currentSession.metadata.submissions[player1.id];
            const p2Submitted = !!currentSession.metadata.submissions[player2.id];

            const updatedEmbed = new EmbedBuilder()
              .setTitle('✂️ Rock-Paper-Scissors')
              .setDescription(
                `**${player1.username}** vs **${player2.username}**\n` +
                `${wagerAmount ? `💰 **Wager**: ${wagerAmount.toLocaleString()} credits each\n` : ''}` +
                `\n**Status**:\n` +
                `• ${player1.username}: ${p1Submitted ? 'Chosen ✅' : 'Thinking 🤔'}\n` +
                `• ${player2.username}: ${p2Submitted ? 'Chosen ✅' : 'Thinking 🤔'}\n\n` +
                `Choices remain hidden until both players choose!`,
              )
              .setColor('#5865F2');

            await discordMsg.edit({ embeds: [updatedEmbed] }).catch(() => null);
          }
        } catch (err: any) {
          await interaction.reply({
            content: `❌ ${err.message ?? 'Submission error'}`,
            ephemeral: true,
          });
        }
      });

      collector.on('end', async (_collected, reason) => {
        if (reason === 'game_over') return;

        const currentSession = services.gameSessionManager.getSession<any>(session.id);
        if (currentSession && currentSession.state === 'IN_PROGRESS') {
          // Check who timed out
          const p1Submitted = !!currentSession.metadata.submissions[player1.id];
          const p2Submitted = !!currentSession.metadata.submissions[player2.id];

          let timedOutPlayerId = player1.id;
          if (p1Submitted && !p2Submitted) {
            timedOutPlayerId = player2.id;
          }

          services.rpsEngine.forfeitOnTimeout(session.id, timedOutPlayerId);

          if (wagerAmount) {
            await services.gameEscrowService.refundWagers(
              guildId,
              [player1, player2],
              wagerAmount,
              'RPS_TIMEOUT_REFUND',
            );
          }

          const timeoutEmbed = new EmbedBuilder()
            .setTitle('✂️ Rock-Paper-Scissors — Timed Out')
            .setDescription('⏰ The match has timed out. Wagers (if any) have been refunded.')
            .setColor('#ED4245');

          const disabledButtons = buildRpsButtons(session.id, true);
          await discordMsg.edit({ embeds: [timeoutEmbed], components: disabledButtons }).catch(() => null);
        }
      });
    },
  };
}
