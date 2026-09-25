import { EmbedBuilder } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';

export function createAchievementCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'achievement',
      category: CommandCategory.TCG,
      description:
        'Track and claim game achievements across 6 tracks and 5 tiers with multi-asset rewards.',
      aliases: ['ach', 'achievements'],
      usage: '/achievement [action: list|claim] [code: <code|all>]',
      examples: [
        '/achievement action:list',
        '/achievement action:claim code:COLL_INITIATE',
        '/achievement action:claim code:all',
      ],
      options: [
        {
          name: 'action',
          description: 'Achievement action (list, claim)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'List (View your achievement progress)', value: 'list' },
            { name: 'Claim (Claim rewards for an unlocked achievement)', value: 'claim' },
          ],
        },
        {
          name: 'code',
          description: 'Achievement code (e.g. COLL_INITIATE) or "all"',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!services.achievementService) {
        await ctx.reply({
          content: '❌ Achievement subsystem is currently unavailable.',
          ephemeral: true,
        });
        return;
      }

      const rawArgs = ctx.options.getRawArgs?.() ?? [];
      const action =
        ctx.options.getString('action')?.toLowerCase() ?? rawArgs[0]?.toLowerCase() ?? 'list';

      switch (action) {
        case 'claim': {
          const rawCode = ctx.options.getString('code') ?? rawArgs[1] ?? 'all';

          try {
            if (rawCode.toLowerCase() === 'all') {
              const claimedList = await services.achievementService.claimAll(ctx.user.id);

              if (claimedList.length === 0) {
                await ctx.reply({
                  content: 'ℹ️ You have no pending unlocked achievements to claim.',
                  ephemeral: true,
                });
                return;
              }

              let totalCredits = 0;
              let totalExp = 0;
              const claimedTitles: string[] = [];

              for (const c of claimedList) {
                totalCredits += c.rewardsDispatched.credits;
                totalExp += c.rewardsDispatched.exp;
                claimedTitles.push(`• **${c.achievement.title}** (${c.achievement.code})`);
              }

              const embed = new EmbedBuilder()
                .setTitle(`🎉 Claimed ${claimedList.length} Achievement(s)!`)
                .setColor(0x57f287)
                .setDescription(
                  `Congratulations <@${ctx.user.id}>! You claimed rewards for:\n` +
                    claimedTitles.join('\n') +
                    `\n\n🪙 **Total Credits:** +${totalCredits.toLocaleString()}\n` +
                    `⚡ **Total EXP:** +${totalExp.toLocaleString()}\n` +
                    `🎁 All equipment, cards, and consumables have been dispatched to your inventory!`,
                )
                .setFooter({ text: 'Achievement Subsystem • Ririko AI 2.0' })
                .setTimestamp();

              await ctx.reply({ embeds: [embed] });
            } else {
              const res = await services.achievementService.claimAchievement(ctx.user.id, rawCode);

              const embed = new EmbedBuilder()
                .setTitle(`🏆 Achievement Claimed: ${res.achievement.title}`)
                .setColor(0x57f287)
                .setDescription(
                  `*${res.achievement.description}*\n\n` +
                    `🪙 **Credits:** +${res.rewardsDispatched.credits.toLocaleString()}\n` +
                    `⚡ **Account EXP:** +${res.rewardsDispatched.exp.toLocaleString()}\n` +
                    (res.rewardsDispatched.title
                      ? `🏷️ **Title Unlocked:** "${res.rewardsDispatched.title}"\n`
                      : '') +
                    (res.rewardsDispatched.badge
                      ? `🎖️ **Badge Unlocked:** ${res.rewardsDispatched.badge}\n`
                      : ''),
                )
                .setFooter({
                  text: `Tier: ${res.achievement.tier} • Code: ${res.achievement.code}`,
                })
                .setTimestamp();

              await ctx.reply({ embeds: [embed] });
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.reply({ content: `❌ ${msg}`, ephemeral: true });
          }
          break;
        }

        case 'list':
        default: {
          try {
            const userAchs = await services.achievementService.getUserAchievements(ctx.user.id);

            let readyToClaimCount = 0;
            const lines: string[] = [];

            for (const item of userAchs) {
              const { achievement, isUnlocked, isClaimed, progress } = item;
              let statusIcon = '🔒';

              if (isClaimed) {
                statusIcon = '✅';
              } else if (isUnlocked) {
                statusIcon = '✨ [READY TO CLAIM]';
                readyToClaimCount++;
              } else {
                statusIcon = `🔒 (${progress}/${achievement.requirementTarget})`;
              }

              lines.push(
                `\`${achievement.code.padEnd(20)}\` **${achievement.title}** [${achievement.tier}]\n` +
                  `  └ ${statusIcon} — *${achievement.description}*`,
              );
            }

            const embed = new EmbedBuilder()
              .setTitle(`🏆 Achievements Progress for ${ctx.user.username}`)
              .setColor(0x5865f2)
              .setDescription(
                (readyToClaimCount > 0
                  ? `🌟 **${readyToClaimCount} achievement(s) ready to claim!** Use \`/achievement action:claim code:all\` to collect all rewards.\n\n`
                  : '') + lines.join('\n\n'),
              )
              .setFooter({ text: 'Achievement Subsystem • Ririko AI 2.0' })
              .setTimestamp();

            await ctx.reply({ embeds: [embed] });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.reply({ content: `❌ ${msg}`, ephemeral: true });
          }
          break;
        }
      }
    },
  };
}
