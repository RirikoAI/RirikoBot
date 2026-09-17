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
import type { TttBoard } from '@ririko/services';

export function buildTttGrid(
  board: TttBoard,
  sessionId: string,
  isEnded: boolean,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const val = board[idx];
      const btn = new ButtonBuilder().setCustomId(`ttt:move:${sessionId}:${idx}`);

      if (val === 'X') {
        btn.setLabel('❌').setStyle(ButtonStyle.Danger).setDisabled(true);
      } else if (val === 'O') {
        btn.setLabel('⭕').setStyle(ButtonStyle.Success).setDisabled(true);
      } else {
        btn.setLabel('⬛').setStyle(ButtonStyle.Secondary).setDisabled(isEnded);
      }

      row.addComponents(btn);
    }
    rows.push(row);
  }
  return rows;
}

export function createTicTacToeCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'tictactoe',
      category: CommandCategory.GAMES,
      description: 'Play an interactive 3x3 Tic-Tac-Toe match against unbeatable Minimax AI or another player',
      usage: '/tictactoe opponent:@user [wager:credits]',
      examples: [
        '/tictactoe opponent:@friend',
        '/tictactoe opponent:AI wager:50',
        '!ttt @friend 100',
        '!tictactoe ai',
      ],
      aliases: ['ttt', 'tic-tac-toe'],
      cooldownSeconds: 5,
      options: [
        {
          name: 'opponent',
          description: 'The user to challenge, or choose AI for unbeatable Minimax AI',
          type: 'USER',
          required: true,
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

      // Parse opponent and wager
      let opponentUser = await ctx.options.getUser('opponent');
      let wagerAmount = ctx.options.getInteger('wager') ?? undefined;

      // Prefix argument parsing fallback
      const rawArgs = ctx.options.getRawArgs();
      if (!opponentUser && rawArgs && rawArgs.length > 0) {
        const firstArg = rawArgs[0]?.trim();
        const secondArg = rawArgs[1]?.trim();

        if (firstArg) {
          const mentionMatch = firstArg.match(/^<@!?(\d+)>$/);
          if (mentionMatch) {
            const mentionedId = mentionMatch[1]!;
            opponentUser = ctx.client.users.cache.get(mentionedId) ?? null;
          } else if (firstArg.toLowerCase() === 'ai' || firstArg.toLowerCase() === 'ririko') {
            opponentUser = ctx.client.user as any;
          }
        }

        if (secondArg && !isNaN(parseInt(secondArg, 10))) {
          wagerAmount = Math.max(1, parseInt(secondArg, 10));
        }
      }

      if (!opponentUser) {
        await ctx.reply({
          content: '❌ Please specify an opponent (e.g. `/tictactoe opponent:@user` or `!ttt ai [wager]`).',
          ephemeral: true,
        });
        return;
      }

      const isVsAi = opponentUser.id === ctx.client.user?.id || opponentUser.bot;

      if (!isVsAi && opponentUser.id === challenger.id) {
        await ctx.reply({
          content: '❌ You cannot play Tic-Tac-Toe against yourself! Choose another player or play against AI.',
          ephemeral: true,
        });
        return;
      }

      const player1 = { id: challenger.id, username: challenger.username };
      const player2 = {
        id: isVsAi ? 'ai' : opponentUser.id,
        username: isVsAi ? 'Ririko AI' : opponentUser.username,
        isAi: isVsAi,
      };

      // Check active game concurrency in channel
      if (services.gameSessionManager.isPlayerActiveInChannel(player1.id, channelId)) {
        await ctx.reply({
          content: '❌ You already have an active game in this channel! Please finish it before starting a new one.',
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

      // Escrow wagers if wager amount specified
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
      const session = services.tictactoeEngine.createGame({
        guildId,
        channelId,
        player1,
        player2,
        wagerAmount,
      });

      const initialRows = buildTttGrid(session.metadata.board, session.id, false);

      const embed = new EmbedBuilder()
        .setTitle('🎮 Tic-Tac-Toe')
        .setDescription(
          `**${player1.username}** (❌) vs **${player2.username}** (⭕)\n` +
          `${wagerAmount ? `💰 **Wager**: ${wagerAmount.toLocaleString()} credits each\n` : ''}` +
          `👉 Current turn: <@${session.currentTurnPlayerId}>`,
        )
        .setColor('#5865F2')
        .setFooter({ text: 'Click an empty square to make your move (60s turn limit)' });

      const replyMsg = await ctx.reply({
        embeds: [embed],
        components: initialRows,
      });

      // Fetch Discord message for component collector
      const discordMsg = (
        'fetch' in replyMsg ? await (replyMsg as any).fetch() : replyMsg
      ) as Message;

      if (!discordMsg || !('createMessageComponentCollector' in discordMsg)) {
        return;
      }

      const collector = discordMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120_000, // 2 minutes total game limit
      });

      collector.on('collect', async (interaction: ButtonInteraction) => {
        const customId = interaction.customId;
        if (!customId.startsWith(`ttt:move:${session.id}:`)) return;

        const cellIndex = parseInt(customId.split(':')[3]!, 10);
        const clickerId = interaction.user.id;

        const currentSession = services.gameSessionManager.getSession<any>(session.id);
        if (!currentSession || currentSession.state !== 'IN_PROGRESS') {
          await interaction.reply({
            content: '⚠️ This game session has already ended or expired.',
            ephemeral: true,
          });
          return;
        }

        if (currentSession.currentTurnPlayerId !== clickerId) {
          await interaction.reply({
            content: '⏳ It is not your turn!',
            ephemeral: true,
          });
          return;
        }

        try {
          const moveResult = services.tictactoeEngine.makeMove(session.id, clickerId, cellIndex);
          const updatedSession = moveResult.session;

          const isGameOver = updatedSession.state === 'COMPLETED' || updatedSession.state === 'TIED';
          const updatedRows = buildTttGrid(updatedSession.metadata.board, session.id, isGameOver);

          let updatedDescription =
            `**${player1.username}** (❌) vs **${player2.username}** (⭕)\n` +
            `${wagerAmount ? `💰 **Wager**: ${wagerAmount.toLocaleString()} credits each\n` : ''}`;

          if (updatedSession.state === 'COMPLETED') {
            const winner = updatedSession.players.find((p: any) => p.id === updatedSession.winnerId);
            updatedDescription += `\n🏆 **Winner**: <@${updatedSession.winnerId}> (${winner?.username ?? 'Player'}) wins!\n`;

            if (wagerAmount) {
              await services.gameEscrowService.settleWagers({
                guildId,
                players: [player1, player2],
                winnerId: updatedSession.winnerId,
                isTie: false,
                amount: wagerAmount,
              });
              updatedDescription += `🎉 Pot of **${(wagerAmount * (player2.isAi ? 2 : 2)).toLocaleString()} credits** awarded to <@${updatedSession.winnerId}>!`;
            }
          } else if (updatedSession.state === 'TIED') {
            updatedDescription += '\n🤝 **Result**: The game ended in a tie!\n';
            if (wagerAmount) {
              await services.gameEscrowService.settleWagers({
                guildId,
                players: [player1, player2],
                winnerId: null,
                isTie: true,
                amount: wagerAmount,
              });
              updatedDescription += `💰 Wagers of **${wagerAmount.toLocaleString()} credits** refunded to both players.`;
            }
          } else {
            updatedDescription += `👉 Current turn: <@${updatedSession.currentTurnPlayerId}>`;
          }

          const updatedEmbed = new EmbedBuilder()
            .setTitle(isGameOver ? '🎮 Tic-Tac-Toe — Game Over' : '🎮 Tic-Tac-Toe')
            .setDescription(updatedDescription)
            .setColor(
              updatedSession.state === 'COMPLETED'
                ? '#57F287'
                : updatedSession.state === 'TIED'
                ? '#FEE75C'
                : '#5865F2',
            )
            .setFooter({
              text: isGameOver ? 'Game concluded' : 'Click an empty square to make your move (60s turn limit)',
            });

          await interaction.update({
            embeds: [updatedEmbed],
            components: updatedRows,
          });

          if (isGameOver) {
            collector.stop('game_over');
          }
        } catch (err: any) {
          await interaction.reply({
            content: `❌ ${err.message ?? 'Invalid move'}`,
            ephemeral: true,
          });
        }
      });

      collector.on('end', async (_collected, reason) => {
        if (reason === 'game_over') return;

        const currentSession = services.gameSessionManager.getSession<any>(session.id);
        if (currentSession && currentSession.state === 'IN_PROGRESS') {
          // Timeout occurred
          services.tictactoeEngine.forfeitGame(
            session.id,
            currentSession.currentTurnPlayerId ?? player1.id,
            'TIMEOUT',
          );

          if (wagerAmount) {
            await services.gameEscrowService.refundWagers(
              guildId,
              [player1, player2],
              wagerAmount,
              'GAME_TIMEOUT_REFUND',
            );
          }

          const timeoutEmbed = new EmbedBuilder()
            .setTitle('🎮 Tic-Tac-Toe — Timed Out')
            .setDescription('⏰ The game has timed out due to inactivity. Wagers (if any) refunded.')
            .setColor('#ED4245');

          const disabledRows = buildTttGrid(currentSession.metadata.board, session.id, true);
          await discordMsg.edit({ embeds: [timeoutEmbed], components: disabledRows }).catch(() => null);
        }
      });
    },
  };
}
