import { EmbedBuilder } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { flipCoin, type CoinSide } from '@ririko/services';

export function createCoinFlipCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'coinflip',
      category: CommandCategory.GAMES,
      description: 'Flip a coin with optional heads/tails guess and credits wager',
      usage: '/coinflip [guess:heads|tails] [wager:credits]',
      examples: [
        '/coinflip',
        '/coinflip guess:heads',
        '/coinflip guess:tails wager:100',
        '!coin-flip',
        '!cf heads 50',
      ],
      aliases: ['coin-flip', 'cf'],
      cooldownSeconds: 2,
      options: [
        {
          name: 'guess',
          description: 'Guess whether the coin will land on heads or tails',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Heads', value: 'heads' },
            { name: 'Tails', value: 'tails' },
          ],
        },
        {
          name: 'wager',
          description: 'Optional amount of credits to wager on your guess',
          type: 'INTEGER',
          required: false,
          minValue: 1,
        },
      ],
    },

    execute: async (ctx: CommandContext) => {
      const guildId = ctx.guild?.id ?? 'global';
      const user = ctx.user;

      let guess = ctx.options.getString('guess')?.toLowerCase() as CoinSide | undefined;
      let wagerAmount = ctx.options.getInteger('wager') ?? undefined;

      // Prefix args fallback: !cf [heads|tails] [wager]
      const rawArgs = ctx.options.getRawArgs();
      if (rawArgs && rawArgs.length > 0) {
        const first = rawArgs[0]?.toLowerCase();
        if (first === 'heads' || first === 'tails') {
          guess = first as CoinSide;
          if (rawArgs[1] && !isNaN(parseInt(rawArgs[1], 10))) {
            wagerAmount = Math.max(1, parseInt(rawArgs[1], 10));
          }
        } else if (!isNaN(parseInt(first ?? '', 10))) {
          wagerAmount = Math.max(1, parseInt(first!, 10));
        }
      }

      if (wagerAmount && !guess) {
        await ctx.reply({
          content: '❌ You must specify a guess (`heads` or `tails`) when placing a wager!',
          ephemeral: true,
        });
        return;
      }

      // If wager placed, verify funds and escrow
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
          source: 'COINFLIP_WAGER',
          metadata: { wagerAmount, guess },
        });
      }

      const result = flipCoin({ guess, wager: wagerAmount });
      const capitalSide = result.side === 'heads' ? 'Heads' : 'Tails';

      let description = `You flipped a coin and it landed on **${capitalSide}**`;

      if (guess) {
        if (result.won) {
          description += `\n🎉 **You guessed correctly!**`;
          if (wagerAmount) {
            const winPot = wagerAmount * 2;
            await services.economyRepo.modifyBalance({
              userId: user.id,
              guildId,
              walletDelta: winPot,
              type: 'GAME_WIN',
              source: 'COINFLIP_WIN',
              metadata: { winPot, originalWager: wagerAmount },
            });
            description += ` You won **${winPot.toLocaleString()} credits**!`;
          }
        } else {
          description += `\n😢 **You guessed wrong!**`;
          if (wagerAmount) {
            description += ` You lost your wager of **${wagerAmount.toLocaleString()} credits**.`;
          }
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('Coin Flip')
        .setDescription(description)
        .setColor(guess ? (result.won ? '#57F287' : '#ED4245') : '#0099ff')
        .setTimestamp();

      await ctx.reply({ embeds: [embed] });
    },
  };
}
