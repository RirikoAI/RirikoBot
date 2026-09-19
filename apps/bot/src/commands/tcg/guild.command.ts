import { EmbedBuilder } from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';

export function createGuildCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'waifuguild',
      category: CommandCategory.TCG,
      description: 'WaifuGuilds: Form player factions, pool bank credits, level up capacity, and climb leaderboards.',
      aliases: ['wguild', 'guild'],
      usage: '/waifuguild [action: create|info|join|leave|deposit|members|leaderboard] [name] [amount]',
      examples: [
        '/waifuguild action:create name:"Starlight Order"',
        '/waifuguild action:info',
        '/waifuguild action:join name:"Starlight Order"',
        '/waifuguild action:deposit amount:1000',
        '/waifuguild action:members',
        '/waifuguild action:leaderboard',
        '/waifuguild action:leave',
      ],
      options: [
        {
          name: 'action',
          description: 'Guild action (create, info, join, leave, deposit, members, leaderboard)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Info (View your guild or target guild)', value: 'info' },
            { name: 'Create (Found a new guild - 5,000 Credits)', value: 'create' },
            { name: 'Join (Join an existing guild)', value: 'join' },
            { name: 'Leave (Leave your current guild)', value: 'leave' },
            { name: 'Deposit (Deposit credits to guild bank)', value: 'deposit' },
            { name: 'Members (List guild roster and ranks)', value: 'members' },
            { name: 'Leaderboard (View top WaifuGuilds)', value: 'leaderboard' },
          ],
        },
        {
          name: 'name',
          description: 'Guild name or ID',
          type: 'STRING',
          required: false,
        },
        {
          name: 'amount',
          description: 'Credit amount to deposit',
          type: 'INTEGER',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!services.waifuGuildService) {
        await ctx.reply({
          content: '❌ WaifuGuild subsystem is currently unavailable.',
          ephemeral: true,
        });
        return;
      }

      const rawArgs = ctx.options.getRawArgs?.() ?? [];
      const action =
        ctx.options.getString('action')?.toLowerCase() ??
        rawArgs[0]?.toLowerCase() ??
        'info';

      switch (action) {
        case 'create': {
          const rawName =
            ctx.options.getString('name') ??
            (rawArgs.length > 1 ? rawArgs.slice(1).join(' ') : undefined);

          if (!rawName) {
            await ctx.reply({
              content: '❌ Please specify a guild name: `/waifuguild action:create name:<guild_name>`',
              ephemeral: true,
            });
            return;
          }

          try {
            const guild = await services.waifuGuildService.createGuild({
              name: rawName,
              leaderUserId: ctx.user.id,
            });

            const embed = new EmbedBuilder()
              .setTitle(`🏰 WaifuGuild Founded: ${guild.name}`)
              .setColor(0x57f287)
              .setDescription(
                `Congratulations <@${ctx.user.id}>! You have officially founded **${guild.name}**.\n` +
                  `🪙 **Creation Fee:** 5,000 Credits deducted.\n` +
                  `👥 **Initial Capacity:** 12 members.\n` +
                  `💡 Members can now join using \`/waifuguild action:join name:"${guild.name}"\`.`,
              )
              .addFields(
                { name: 'Guild ID', value: `\`${guild.id}\``, inline: true },
                { name: 'Level', value: `${guild.level}`, inline: true },
                { name: 'Guild Bank', value: `${guild.guildBank.toLocaleString()} Credits`, inline: true },
              )
              .setFooter({ text: 'WaifuGuilds Subsystem • Ririko AI 2.0' })
              .setTimestamp();

            await ctx.reply({ embeds: [embed] });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.reply({ content: `❌ ${msg}`, ephemeral: true });
          }
          break;
        }

        case 'join': {
          const targetName =
            ctx.options.getString('name') ??
            (rawArgs.length > 1 ? rawArgs.slice(1).join(' ') : undefined);

          if (!targetName) {
            await ctx.reply({
              content: '❌ Please specify the guild name or ID: `/waifuguild action:join name:<guild_name>`',
              ephemeral: true,
            });
            return;
          }

          try {
            const member = await services.waifuGuildService.joinGuild(ctx.user.id, targetName);
            const details = await services.waifuGuildService.getGuildDetails(member.guildId);

            const embed = new EmbedBuilder()
              .setTitle(`⚔️ Joined WaifuGuild: ${details.guild.name}`)
              .setColor(0x5865f2)
              .setDescription(
                `Welcome <@${ctx.user.id}>! You are now a member of **${details.guild.name}**.\n` +
                  `👥 **Roster:** ${details.memberCount}/${details.maxMembers} members.\n` +
                  `⚡ Earn battle XP in card duels and dungeons to contribute to guild leveling!`,
              )
              .setFooter({ text: 'WaifuGuilds Subsystem • Ririko AI 2.0' })
              .setTimestamp();

            await ctx.reply({ embeds: [embed] });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.reply({ content: `❌ ${msg}`, ephemeral: true });
          }
          break;
        }

        case 'leave': {
          try {
            const res = await services.waifuGuildService.leaveGuild(ctx.user.id);
            const embed = new EmbedBuilder()
              .setTitle('🚪 Left WaifuGuild')
              .setColor(0xed4245)
              .setDescription(
                res.disbanded
                  ? `You have disbanded **${res.guildName}** as its sole remaining member.`
                  : `You have successfully left **${res.guildName}**.`,
              )
              .setTimestamp();

            await ctx.reply({ embeds: [embed] });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.reply({ content: `❌ ${msg}`, ephemeral: true });
          }
          break;
        }

        case 'deposit': {
          const amount =
            ctx.options.getInteger('amount') ??
            (rawArgs[1] ? parseInt(rawArgs[1], 10) : NaN);

          if (isNaN(amount) || amount <= 0) {
            await ctx.reply({
              content: '❌ Please specify a positive credit amount: `/waifuguild action:deposit amount:<number>`',
              ephemeral: true,
            });
            return;
          }

          try {
            const res = await services.waifuGuildService.depositCredits(ctx.user.id, amount);
            const embed = new EmbedBuilder()
              .setTitle('🪙 Guild Bank Deposit')
              .setColor(0xfee75c)
              .setDescription(
                `Successfully deposited **${amount.toLocaleString()} Credits** into the guild bank!\n\n` +
                  `🏦 **Guild Bank Total:** ${res.newGuildBank.toLocaleString()} Credits\n` +
                  `👛 **Remaining Wallet:** ${res.remainingWallet.toLocaleString()} Credits`,
              )
              .setTimestamp();

            await ctx.reply({ embeds: [embed] });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.reply({ content: `❌ ${msg}`, ephemeral: true });
          }
          break;
        }

        case 'members': {
          const targetName =
            ctx.options.getString('name') ??
            (rawArgs[1] ? rawArgs.slice(1).join(' ') : undefined);

          try {
            const details = targetName
              ? await services.waifuGuildService.getGuildDetails(targetName)
              : await services.waifuGuildService.getUserGuildDetails(ctx.user.id);

            if (!details) {
              await ctx.reply({
                content: '❌ You are not in a guild. Specify a guild name or join one first.',
                ephemeral: true,
              });
              return;
            }

            const memberLines = details.members.map((m, idx) => {
              const badge = m.rank === 'LEADER' ? '👑' : m.rank === 'OFFICER' ? '⭐' : '🛡️';
              return `\`${idx + 1}.\` ${badge} <@${m.userId}> — **${m.rank}** | ⚡ ${m.contributionXp.toLocaleString()} XP`;
            });

            const embed = new EmbedBuilder()
              .setTitle(`👥 ${details.guild.name} — Member Roster`)
              .setColor(0x5865f2)
              .setDescription(
                `**Total Members:** ${details.memberCount}/${details.maxMembers}\n\n` +
                  memberLines.join('\n'),
              )
              .setFooter({ text: 'WaifuGuilds Subsystem • Ririko AI 2.0' })
              .setTimestamp();

            await ctx.reply({ embeds: [embed] });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.reply({ content: `❌ ${msg}`, ephemeral: true });
          }
          break;
        }

        case 'leaderboard': {
          try {
            const guilds = await services.waifuGuildService.getLeaderboard(10, 0);

            if (guilds.length === 0) {
              await ctx.reply({
                content: '🏰 No WaifuGuilds have been established yet! Be the first with `/waifuguild action:create`.',
              });
              return;
            }

            const lines = guilds.map((g, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `\`#${idx + 1}\``;
              return `${medal} **${g.name}** — Lv.${g.level} | ⚡ ${g.guildXp.toLocaleString()} XP | 🪙 ${g.guildBank.toLocaleString()} Credits`;
            });

            const embed = new EmbedBuilder()
              .setTitle('🏆 WaifuGuilds Top Rankings')
              .setColor(0xf1c40f)
              .setDescription(lines.join('\n\n'))
              .setFooter({ text: 'WaifuGuilds Subsystem • Ririko AI 2.0' })
              .setTimestamp();

            await ctx.reply({ embeds: [embed] });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.reply({ content: `❌ ${msg}`, ephemeral: true });
          }
          break;
        }

        case 'info':
        default: {
          const targetName =
            ctx.options.getString('name') ??
            (rawArgs[1] ? rawArgs.slice(1).join(' ') : undefined);

          try {
            const details = targetName
              ? await services.waifuGuildService.getGuildDetails(targetName)
              : await services.waifuGuildService.getUserGuildDetails(ctx.user.id);

            if (!details) {
              await ctx.reply({
                content:
                  '❌ You are not in a WaifuGuild. Create one with `/waifuguild action:create` or view another guild with `/waifuguild action:info name:<guild_name>`.',
                ephemeral: true,
              });
              return;
            }

            const { guild, memberCount, maxMembers, xpToNextLevel } = details;
            const xpPct = Math.min(100, Math.round((guild.guildXp / xpToNextLevel) * 100));
            const barFilled = Math.round(xpPct / 10);
            const progressBar = '▰'.repeat(barFilled) + '▱'.repeat(10 - barFilled);

            const embed = new EmbedBuilder()
              .setTitle(`🏰 WaifuGuild: ${guild.name}`)
              .setColor(0x5865f2)
              .setDescription(
                `👑 **Guild Leader:** <@${guild.leaderUserId}>\n` +
                  `👥 **Members:** ${memberCount}/${maxMembers}\n` +
                  `🪙 **Guild Bank:** ${guild.guildBank.toLocaleString()} Credits\n\n` +
                  `📊 **Guild Level:** ${guild.level}\n` +
                  `⚡ **XP Progress:** ${guild.guildXp.toLocaleString()} / ${xpToNextLevel.toLocaleString()} XP (${xpPct}%)\n` +
                  `\`[${progressBar}]\``,
              )
              .setFooter({ text: `Guild ID: ${guild.id} • Founded ${guild.createdAt.toLocaleDateString()}` })
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
