import { EmbedBuilder } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';

/**
 * `/energy`: shows the player's global energy pool, bonus energy, potions used today and the
 * time of the next daily refill. Energy is global, so the command works in servers and in DMs.
 */
export function createEnergyCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'energy',
      category: CommandCategory.TCG,
      description: 'Shows your energy, bonus energy, potions used today and the next refill.',
      aliases: ['stamina'],
      usage: '/energy',
      examples: ['/energy', '!energy', '!stamina'],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const lifecycle = services.energyLifecycleService;
      const energy = await lifecycle.getOrReconcileUserEnergy(ctx.user.id);
      const rules = await lifecycle.rules();
      const nextResetAt = lifecycle.nextResetAt();

      const bonusLine =
        `${energy.bonusEnergy}/${rules.maxBonusCap}` +
        (energy.bonusEnergy < rules.maxBonusCap && rules.dailyBonusIncrement > 0
          ? ` (+${rules.dailyBonusIncrement} at the next reset)`
          : '');

      const embed = new EmbedBuilder()
        .setTitle(`⚡ ${ctx.user.username}'s Energy`)
        .setColor(0xff4500)
        .addFields(
          {
            name: '⚡ Energy',
            value: `\`${energy.currentEnergy}/${energy.maxEnergy + energy.bonusEnergy}\``,
            inline: true,
          },
          { name: '📈 Level cap', value: `\`${energy.maxEnergy}\``, inline: true },
          { name: '🔋 Bonus energy', value: `\`${bonusLine}\``, inline: true },
          {
            name: '🧪 Potions today',
            value: `\`${energy.dailyEnergyPotsUsed}/${rules.dailyPotionLimit}\``,
            inline: true,
          },
          {
            name: '⏰ Next refill',
            value: `<t:${Math.floor(nextResetAt.getTime() / 1000)}:R>`,
            inline: true,
          },
        )
        .setFooter({
          text: 'Energy refills at each daily reset. /dungeon, /game, /adventure and duels use it.',
        });

      await ctx.reply({ embeds: [embed] });
    },
  };
}
