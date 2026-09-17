import { EmbedBuilder } from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { rollDice, rollVsBot } from '@ririko/services';

export function createDiceCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'dice',
      category: CommandCategory.GAMES,
      description: 'Roll a dice, roll multiple dice, or challenge Ririko to a dice roll wager',
      usage: '/dice [count:1-6] [sides:2-100] [wager:credits]',
      examples: [
        '/dice',
        '/dice count:2 sides:6',
        '/dice wager:50',
        '!dice',
        '!roll 2',
        '!roll wager 100',
      ],
      aliases: ['roll'],
      cooldownSeconds: 2,
      options: [
        {
          name: 'count',
          description: 'Number of dice to roll (1-6, default 1)',
          type: 'INTEGER',
          required: false,
          minValue: 1,
          maxValue: 6,
        },
        {
          name: 'sides',
          description: 'Number of sides per die (default 6)',
          type: 'INTEGER',
          required: false,
          minValue: 2,
          maxValue: 100,
        },
        {
          name: 'wager',
          description: 'Wager credits in a roll-off match against Ririko',
          type: 'INTEGER',
          required: false,
          minValue: 1,
        },
      ],
    },

    execute: async (ctx: CommandContext) => {
      const guildId = ctx.guild?.id ?? 'global';
      const user = ctx.user;

      let count = ctx.options.getInteger('count') ?? 1;
      const sides = ctx.options.getInteger('sides') ?? 6;
      let wagerAmount = ctx.options.getInteger('wager') ?? undefined;

      // Prefix parsing fallback: !dice [count] or !roll [wager]
      const rawArgs = ctx.options.getRawArgs();
      if (rawArgs && rawArgs.length > 0) {
        const first = rawArgs[0]?.toLowerCase();
        if (first === 'wager' && rawArgs[1] && !isNaN(parseInt(rawArgs[1], 10))) {
          wagerAmount = Math.max(1, parseInt(rawArgs[1], 10));
        } else if (!isNaN(parseInt(first ?? '', 10))) {
          const num = parseInt(first!, 10);
          if (num > 10) {
            wagerAmount = num;
          } else {
            count = Math.max(1, Math.min(6, num));
          }
        }
      }

      // Wager match against Ririko
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
          source: 'DICE_WAGER',
          metadata: { wagerAmount },
        });

        const vsResult = rollVsBot({ wager: wagerAmount });
        let desc =
          `🎲 **You** rolled: **${vsResult.playerRoll}**\n` +
          `🤖 **Ririko** rolled: **${vsResult.botRoll}**\n\n`;

        if (vsResult.outcome === 'WIN') {
          const winPot = wagerAmount * 2;
          await services.economyRepo.modifyBalance({
            userId: user.id,
            guildId,
            walletDelta: winPot,
            type: 'GAME_WIN',
            source: 'DICE_WIN',
            metadata: { winPot, originalWager: wagerAmount },
          });
          desc += `🎉 **You won the roll-off!** Awarded **${winPot.toLocaleString()} credits**!`;
        } else if (vsResult.outcome === 'TIE') {
          await services.economyRepo.modifyBalance({
            userId: user.id,
            guildId,
            walletDelta: wagerAmount,
            type: 'GAME_ESCROW_REFUND',
            source: 'DICE_TIE',
            metadata: { refundAmount: wagerAmount },
          });
          desc += `🤝 **It's a tie!** Wager of **${wagerAmount.toLocaleString()} credits** refunded.`;
        } else {
          desc += `😢 **Ririko won the roll-off!** You lost your wager of **${wagerAmount.toLocaleString()} credits**.`;
        }

        const embed = new EmbedBuilder()
          .setTitle('Dice Roll-off')
          .setDescription(desc)
          .setColor(vsResult.outcome === 'WIN' ? '#57F287' : vsResult.outcome === 'TIE' ? '#FEE75C' : '#ED4245')
          .setTimestamp();

        await ctx.reply({ embeds: [embed] });
        return;
      }

      // Solo dice roll
      const result = rollDice({ count, sides });

      let description: string;
      if (count === 1) {
        description = `You rolled a dice and it landed on **${result.total}**`;
      } else {
        description = `You rolled **${count}**d**${sides}** dice: [${result.rolls.join(', ')}]\nTotal: **${result.total}**`;
      }

      const embed = new EmbedBuilder()
        .setTitle('Dice Roll')
        .setDescription(description)
        .setColor('#0099ff')
        .setTimestamp();

      await ctx.reply({ embeds: [embed] });
    },
  };
}
