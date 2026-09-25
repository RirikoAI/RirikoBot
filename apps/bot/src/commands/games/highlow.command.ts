import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type Message,
  type ButtonInteraction,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { generateHighLowInitial, evaluateHighLow, type HighLowGuess } from '@ririko/services';

export function createHighLowCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'highlow',
      category: CommandCategory.GAMES,
      description: 'Guess if the next random number (1-100) will be higher or lower',
      usage: '/highlow [wager:credits]',
      examples: ['/highlow', '/highlow wager:100', '!high-low', '!hl 50'],
      aliases: ['high-low', 'hl'],
      cooldownSeconds: 3,
      options: [
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
      const user = ctx.user;

      let wagerAmount = ctx.options.getInteger('wager') ?? undefined;
      const rawArgs = ctx.options.getRawArgs();
      if (!wagerAmount && rawArgs && rawArgs[0] && !isNaN(parseInt(rawArgs[0], 10))) {
        wagerAmount = Math.max(1, parseInt(rawArgs[0], 10));
      }

      // Escrow wager if provided
      if (wagerAmount && wagerAmount > 0) {
        const isFrozen = await services.economyRepo.isAccountFrozen(user.id);
        if (isFrozen) {
          await ctx.reply({ content: '❌ Your economy account is frozen.', ephemeral: true });
          return;
        }

        const bal = await services.economyRepo.getOrCreateBalance(user.id);
        if (Number(bal.walletBalance) < wagerAmount) {
          await ctx.reply({
            content: `❌ Insufficient funds. You have ${bal.walletBalance} credits, but wager is ${wagerAmount}.`,
            ephemeral: true,
          });
          return;
        }

        await services.economyRepo.modifyBalance({
          userId: user.id,
          guildId,
          walletDelta: -wagerAmount,
          type: 'GAME_ESCROW',
          source: 'HIGHLOW_WAGER',
          metadata: { wagerAmount },
        });
      }

      const initial = generateHighLowInitial();
      const currentNumber = initial.currentNumber;
      const gameId = randomUUID().slice(0, 8);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`hl:guess:${gameId}:higher`)
          .setLabel('Higher')
          .setEmoji('⬆️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`hl:guess:${gameId}:lower`)
          .setLabel('Lower')
          .setEmoji('⬇️')
          .setStyle(ButtonStyle.Primary),
      );

      const embed = new EmbedBuilder()
        .setTitle('High Low')
        .setDescription(
          `The number is **${currentNumber}**. Will the next number be higher or lower?\n` +
            `${wagerAmount ? `💰 **Wager**: ${wagerAmount.toLocaleString()} credits\n` : ''}` +
            `\nClick a button below to guess within 15 seconds!`,
        )
        .setColor('#0099ff')
        .setTimestamp();

      const replyMsg = await ctx.reply({
        embeds: [embed],
        components: [row],
      });

      const discordMsg = (
        'fetch' in replyMsg ? await (replyMsg as any).fetch() : replyMsg
      ) as Message;

      if (!discordMsg || !('createMessageComponentCollector' in discordMsg)) {
        return;
      }

      const collector = discordMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 15_000,
        max: 1,
      });

      collector.on('collect', async (interaction: ButtonInteraction) => {
        if (interaction.user.id !== user.id) {
          await interaction.reply({
            content: '❌ This HighLow game belongs to someone else!',
            ephemeral: true,
          });
          return;
        }

        const guess = interaction.customId.split(':')[3] as HighLowGuess;
        const result = evaluateHighLow({ currentNumber, guess, wager: wagerAmount });

        let resultRelation: string;
        if (result.nextNumber > currentNumber) {
          resultRelation = 'higher';
        } else if (result.nextNumber < currentNumber) {
          resultRelation = 'lower';
        } else {
          resultRelation = 'the same';
        }

        let outcomeText = `The number is **${result.nextNumber}**. It was **${resultRelation}** than **${currentNumber}**.\n`;

        if (result.outcome === 'WIN') {
          outcomeText += '🎉 **You guessed correctly!**';
          if (wagerAmount) {
            const winPot = wagerAmount * 2;
            await services.economyRepo.modifyBalance({
              userId: user.id,
              guildId,
              walletDelta: winPot,
              type: 'GAME_WIN',
              source: 'HIGHLOW_WIN',
              metadata: { winPot, originalWager: wagerAmount },
            });
            outcomeText += ` You won **${winPot.toLocaleString()} credits**!`;
          }
        } else if (result.outcome === 'TIE') {
          outcomeText += "🤝 **It was the same number! It's a tie.**";
          if (wagerAmount) {
            await services.economyRepo.modifyBalance({
              userId: user.id,
              guildId,
              walletDelta: wagerAmount,
              type: 'GAME_ESCROW_REFUND',
              source: 'HIGHLOW_TIE',
              metadata: { refundAmount: wagerAmount },
            });
            outcomeText += ` Wager refunded.`;
          }
        } else {
          outcomeText += '😢 **You guessed wrong!**';
          if (wagerAmount) {
            outcomeText += ` You lost **${wagerAmount.toLocaleString()} credits**.`;
          }
        }

        const resultEmbed = new EmbedBuilder()
          .setTitle('High Low')
          .setDescription(outcomeText)
          .setColor(
            result.outcome === 'WIN' ? '#57F287' : result.outcome === 'TIE' ? '#FEE75C' : '#ED4245',
          )
          .setTimestamp();

        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`hl:guess:${gameId}:higher`)
            .setLabel('Higher')
            .setEmoji('⬆️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`hl:guess:${gameId}:lower`)
            .setLabel('Lower')
            .setEmoji('⬇️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        );

        await interaction.update({ embeds: [resultEmbed], components: [disabledRow] });
      });

      collector.on('end', async (_collected, reason) => {
        if (reason === 'time') {
          // Timeout refund if wagered
          if (wagerAmount) {
            await services.economyRepo.modifyBalance({
              userId: user.id,
              guildId,
              walletDelta: wagerAmount,
              type: 'GAME_ESCROW_REFUND',
              source: 'HIGHLOW_TIMEOUT',
              metadata: { refundAmount: wagerAmount },
            });
          }

          const timeoutEmbed = new EmbedBuilder()
            .setTitle('High Low')
            .setDescription('You took too long to guess! Wager (if any) refunded.')
            .setColor('#ED4245')
            .setTimestamp();

          await discordMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => null);
        }
      });
    },
  };
}
