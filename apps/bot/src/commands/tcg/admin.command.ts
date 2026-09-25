import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import type { TcgConfigKey } from '@ririko/services';

export function createTcgAdminCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'tcg-admin',
      category: CommandCategory.TCG,
      description:
        'TCG Administration: Manage game balance, energy caps, dungeon curves, and market taxes.',
      aliases: ['tcgadmin', 'tcgconfig'],
      usage: '/tcg-admin [action: view|energy|dungeon|market|role] [value]',
      examples: [
        '/tcg-admin action:view',
        '/tcg-admin action:energy max_cap:350 pot_limit:5 bonus_cap:50 bonus_increment:5',
        '/tcg-admin action:dungeon scaling_model:EXPONENTIAL growth_rate:0.09',
        '/tcg-admin action:market tax_rate:0.05',
        '/tcg-admin action:role role:@TCGManager',
      ],
      options: [
        {
          name: 'action',
          description: 'Admin action (view, energy, dungeon, market, role)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'View (View current TCG configuration)', value: 'view' },
            { name: 'Energy (Configure energy capacity & potion limits)', value: 'energy' },
            { name: 'Dungeon (Configure PvE scaling model & growth rate)', value: 'dungeon' },
            { name: 'Market (Configure marketplace tax rate)', value: 'market' },
            { name: 'Role (Configure TCG Manager Role)', value: 'role' },
          ],
        },
        {
          name: 'max_cap',
          description: 'Global max energy cap (100 - 1000)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'pot_limit',
          description: 'Daily stamina potion usage limit (1 - 10)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'bonus_cap',
          description: 'Maximum bonus energy cap a player can accumulate daily (0 - 500)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'bonus_increment',
          description: 'Daily bonus energy increment granted on reset rollover (0 - 50)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'scaling_model',
          description: 'Dungeon scaling model (LINEAR, POLYNOMIAL, EXPONENTIAL, HYBRID)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'HYBRID (Recommended baseline)', value: 'HYBRID' },
            { name: 'EXPONENTIAL (Classic exponential curve)', value: 'EXPONENTIAL' },
            { name: 'POLYNOMIAL (Smoother mid-tier progression)', value: 'POLYNOMIAL' },
            { name: 'LINEAR (Constant growth)', value: 'LINEAR' },
          ],
        },
        {
          name: 'growth_rate',
          description: 'Dungeon exponential growth rate (0.03 - 0.25)',
          type: 'NUMBER',
          required: false,
        },
        {
          name: 'tax_rate',
          description: 'Marketplace transaction tax rate (0.00 - 0.50)',
          type: 'NUMBER',
          required: false,
        },
        {
          name: 'role',
          description: 'Role or role ID designated as TCG Manager',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!services.tcgConfigService) {
        await ctx.reply({
          content: '❌ TCG Configuration subsystem is currently unavailable.',
          ephemeral: true,
        });
        return;
      }

      // Security check
      const memberRoles: string[] = ctx.member?.roles
        ? Array.from(
            ((ctx.member.roles as any).cache?.keys?.() ??
              (Array.isArray(ctx.member.roles) ? ctx.member.roles : [])) as Iterable<string>,
          )
        : [];
      const isServerAdmin =
        Boolean(ctx.member?.permissions.has(PermissionFlagsBits.Administrator)) ||
        Boolean(ctx.member?.permissions.has(PermissionFlagsBits.ManageGuild));

      const isAuth = await services.tcgConfigService.isAuthorized({
        memberRoles,
        isServerAdmin,
      });

      if (!isAuth) {
        await ctx.reply({
          content:
            '❌ **Access Denied:** You must possess `Administrator` / `ManageGuild` permissions or the designated TCG Manager role to run this command.',
          ephemeral: true,
        });
        return;
      }

      const rawArgs = ctx.options.getRawArgs?.() ?? [];
      const action =
        ctx.options.getString('action')?.toLowerCase() ?? rawArgs[0]?.toLowerCase() ?? 'view';

      switch (action) {
        case 'energy': {
          let maxCap = ctx.options.getInteger('max_cap');
          let potLimit = ctx.options.getInteger('pot_limit');
          let bonusCap = ctx.options.getInteger('bonus_cap');
          let bonusIncrement = ctx.options.getInteger('bonus_increment');

          // Fallback parsing for prefix key:value arguments e.g. !tcg-admin energy bonus_cap:100 bonus_increment:10
          for (const arg of rawArgs.slice(1)) {
            const [k, v] = arg.split(':');
            if (k && v) {
              const num = parseInt(v, 10);
              if (!isNaN(num)) {
                const keyLower = k.toLowerCase();
                if (keyLower === 'max_cap' || keyLower === 'maxcap') maxCap = num;
                if (keyLower === 'pot_limit' || keyLower === 'potlimit') potLimit = num;
                if (keyLower === 'bonus_cap' || keyLower === 'bonuscap') bonusCap = num;
                if (
                  keyLower === 'bonus_increment' ||
                  keyLower === 'bonusincrement' ||
                  keyLower === 'increment'
                )
                  bonusIncrement = num;
              }
            }
          }

          const changes: string[] = [];
          try {
            if (maxCap !== null && maxCap !== undefined) {
              await services.tcgConfigService.setConfig(
                'global_max_energy_cap',
                maxCap,
                ctx.user.id,
              );
              changes.push(`• **Max Energy Cap:** \`${maxCap}\``);
            }
            if (potLimit !== null && potLimit !== undefined) {
              await services.tcgConfigService.setConfig(
                'daily_energy_restore_pot_limit',
                potLimit,
                ctx.user.id,
              );
              changes.push(`• **Daily Potion Limit:** \`${potLimit}\``);
            }
            if (bonusCap !== null && bonusCap !== undefined) {
              await services.tcgConfigService.setConfig(
                'max_bonus_energy_cap',
                bonusCap,
                ctx.user.id,
              );
              changes.push(`• **Max Bonus Energy Cap:** \`${bonusCap}\``);
            }
            if (bonusIncrement !== null && bonusIncrement !== undefined) {
              await services.tcgConfigService.setConfig(
                'daily_bonus_energy_increment',
                bonusIncrement,
                ctx.user.id,
              );
              changes.push(`• **Daily Bonus Increment:** \`+${bonusIncrement}\``);
            }

            if (changes.length === 0) {
              await ctx.reply({
                content:
                  'ℹ️ No energy parameters provided to update. Usage: `/tcg-admin action:energy max_cap:350 pot_limit:5 bonus_cap:50 bonus_increment:5`',
                ephemeral: true,
              });
              return;
            }

            const embed = new EmbedBuilder()
              .setTitle('⚡ Energy Parameters Updated')
              .setColor(0x57f287)
              .setDescription(changes.join('\n'))
              .setFooter({ text: `Updated by @${ctx.user.username}` })
              .setTimestamp();

            await ctx.reply({ embeds: [embed] });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.reply({ content: `❌ Configuration Error: ${msg}`, ephemeral: true });
          }
          break;
        }

        case 'dungeon': {
          const scalingModel = ctx.options.getString('scaling_model');
          const growthRate = ctx.options.getNumber('growth_rate');

          const changes: string[] = [];
          try {
            if (scalingModel) {
              await services.tcgConfigService.setConfig(
                'dungeon_scaling_model',
                scalingModel as 'LINEAR' | 'POLYNOMIAL' | 'EXPONENTIAL' | 'HYBRID',
                ctx.user.id,
              );
              changes.push(`• **Scaling Model:** \`${scalingModel}\``);
            }
            if (growthRate !== null && growthRate !== undefined) {
              await services.tcgConfigService.setConfig(
                'dungeon_growth_rate',
                growthRate,
                ctx.user.id,
              );
              changes.push(`• **Growth Rate:** \`${growthRate}\``);
            }

            if (changes.length === 0) {
              await ctx.reply({
                content:
                  'ℹ️ No dungeon parameters provided to update. Usage: `/tcg-admin action:dungeon scaling_model:EXPONENTIAL growth_rate:0.09`',
                ephemeral: true,
              });
              return;
            }

            const embed = new EmbedBuilder()
              .setTitle('🏰 Dungeon Tower Parameters Updated')
              .setColor(0x57f287)
              .setDescription(changes.join('\n'))
              .setFooter({ text: `Updated by @${ctx.user.username}` })
              .setTimestamp();

            await ctx.reply({ embeds: [embed] });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.reply({ content: `❌ Configuration Error: ${msg}`, ephemeral: true });
          }
          break;
        }

        case 'market': {
          const taxRate = ctx.options.getNumber('tax_rate');

          if (taxRate === null || taxRate === undefined) {
            await ctx.reply({
              content:
                'ℹ️ Please specify a tax rate: `/tcg-admin action:market tax_rate:0.05` (5%)',
              ephemeral: true,
            });
            return;
          }

          try {
            await services.tcgConfigService.setConfig('market_tax_rate', taxRate, ctx.user.id);

            const embed = new EmbedBuilder()
              .setTitle('🏪 Marketplace Tax Rate Updated')
              .setColor(0x57f287)
              .setDescription(`• **New Tax Rate:** \`${(taxRate * 100).toFixed(1)}%\``)
              .setFooter({ text: `Updated by @${ctx.user.username}` })
              .setTimestamp();

            await ctx.reply({ embeds: [embed] });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.reply({ content: `❌ Configuration Error: ${msg}`, ephemeral: true });
          }
          break;
        }

        case 'role': {
          const rawRole = ctx.options.getString('role') ?? rawArgs[1];
          const roleId = rawRole?.replace(/[<@&>]/g, '');

          if (!roleId) {
            await ctx.reply({
              content: 'ℹ️ Please specify a role: `/tcg-admin action:role role:@Role`',
              ephemeral: true,
            });
            return;
          }

          try {
            await services.tcgConfigService.setConfig('tcg_manager_role_id', roleId, ctx.user.id);

            const embed = new EmbedBuilder()
              .setTitle('🛡️ TCG Manager Role Configured')
              .setColor(0x57f287)
              .setDescription(
                `Members with <@&${roleId}> can now access and manage TCG administration settings.`,
              )
              .setFooter({ text: `Updated by @${ctx.user.username}` })
              .setTimestamp();

            await ctx.reply({ embeds: [embed] });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.reply({ content: `❌ Configuration Error: ${msg}`, ephemeral: true });
          }
          break;
        }

        case 'view':
        default: {
          try {
            const configs = await services.tcgConfigService.getAllConfigs();

            const embed = new EmbedBuilder()
              .setTitle('⚙️ Global Waifu TCG Configuration')
              .setColor(0x5865f2)
              .setDescription(
                'Live global parameters governing combat, dungeons, energy, and economy.',
              )
              .addFields(
                {
                  name: '⚡ Energy Subsystem',
                  value:
                    `• **Base Capacity:** \`${configs.base_energy_capacity}\`\n` +
                    `• **Max Cap:** \`${configs.global_max_energy_cap}\`\n` +
                    `• **Scaling Per Level:** \`+${configs.energy_scaling_per_level}\`\n` +
                    `• **Max Bonus Cap:** \`${configs.max_bonus_energy_cap}\`\n` +
                    `• **Daily Bonus Increment:** \`+${configs.daily_bonus_energy_increment}\`\n` +
                    `• **Daily Potions Limit:** \`${configs.daily_energy_restore_pot_limit}\`\n` +
                    `• **Replenish Cron:** \`${configs.daily_replenish_cron}\``,
                  inline: false,
                },
                {
                  name: '🏰 Dungeon Tower Subsystem',
                  value:
                    `• **Scaling Model:** \`${configs.dungeon_scaling_model}\`\n` +
                    `• **Growth Rate:** \`${configs.dungeon_growth_rate}\``,
                  inline: false,
                },
                {
                  name: '🏪 Marketplace & Roles',
                  value:
                    `• **Market Tax Rate:** \`${(configs.market_tax_rate * 100).toFixed(1)}%\`\n` +
                    `• **TCG Manager Role:** ${configs.tcg_manager_role_id ? `<@&${configs.tcg_manager_role_id}>` : '*None configured (Server Admins only)*'}`,
                  inline: false,
                },
              )
              .setFooter({ text: 'Governance & Administration • Ririko AI 2.0' })
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
