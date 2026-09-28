import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { canManageGuildTcg, GuildConfigValidationError } from '@ririko/services';

/** `/tcg-admin action:drops` options and the `tcg` settings each one sets. */
const DROP_OPTIONS = {
  enabled: 'dropsEnabled',
  channel: 'dropChannelId',
  threshold: 'dropMessageThreshold',
  start_hour: 'dropStartHour',
  end_hour: 'dropEndHour',
  claim_seconds: 'dropClaimTimeoutSeconds',
  cooldown_minutes: 'dropCooldownMinutes',
} as const;

/** Reads `key:value` prefix arguments into `tcg` settings; `<#id>` channels become IDs. */
function readDropArgs(rawArgs: readonly string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const arg of rawArgs) {
    const separator = arg.indexOf(':');
    if (separator <= 0) continue;
    const key = arg.slice(0, separator).toLowerCase();
    if (!Object.hasOwn(DROP_OPTIONS, key)) continue;
    patch[DROP_OPTIONS[key as keyof typeof DROP_OPTIONS]] = arg
      .slice(separator + 1)
      .replace(/^<#(\d+)>$/, '$1');
  }
  return patch;
}

function describeDrops(values: {
  dropsEnabled: boolean;
  dropChannelId: string | null;
  dropMessageThreshold: number;
  dropStartHour: number;
  dropEndHour: number;
  dropClaimTimeoutSeconds: number;
  dropCooldownMinutes: number;
}): string {
  const hour = (value: number) => `${String(value).padStart(2, '0')}:00`;
  const hours =
    values.dropStartHour === values.dropEndHour
      ? 'all day'
      : `${hour(values.dropStartHour)} to ${hour(values.dropEndHour)}`;
  return (
    `• **Drops:** \`${values.dropsEnabled ? 'On' : 'Off'}\`\n` +
    `• **Channel:** ${values.dropChannelId ? `<#${values.dropChannelId}>` : 'Every channel'}\n` +
    `• **Unique Chatters:** \`${values.dropMessageThreshold}\`\n` +
    `• **Hours:** ${hours} (server time zone)\n` +
    `• **Claim Window:** \`${values.dropClaimTimeoutSeconds}s\`\n` +
    `• **Repeat-Claim Cooldown:** \`${values.dropCooldownMinutes} min\``
  );
}

export function createTcgAdminCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'tcg-admin',
      category: CommandCategory.TCG,
      description:
        'TCG Administration: Manage game balance, energy caps, dungeon curves, and market taxes.',
      aliases: ['tcgadmin', 'tcgconfig'],
      usage: '/tcg-admin [action: view|drops|energy|dungeon|market|role] [value]',
      examples: [
        '/tcg-admin action:view',
        '/tcg-admin action:drops enabled:true channel:#tcg-drops threshold:30',
        '/tcg-admin action:energy max_cap:350 pot_limit:5 bonus_cap:50 bonus_increment:5',
        '/tcg-admin action:dungeon scaling_model:EXPONENTIAL growth_rate:0.09',
        '/tcg-admin action:market tax_rate:0.05',
        '/tcg-admin action:role role:@TCGManager',
      ],
      options: [
        {
          name: 'action',
          description: 'Admin action (view, drops, energy, dungeon, market, role)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'View (View current TCG configuration)', value: 'view' },
            { name: 'Drops (Configure card drops in this server)', value: 'drops' },
            { name: 'Energy (Configure energy capacity & potion limits)', value: 'energy' },
            { name: 'Dungeon (Configure PvE scaling model & growth rate)', value: 'dungeon' },
            { name: 'Market (Configure marketplace tax rate)', value: 'market' },
            { name: 'Role (Configure this server TCG Manager Role)', value: 'role' },
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
          description: 'Role or role ID designated as TCG Manager in this server (none to clear)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'enabled',
          description: 'Card drops on or off in this server',
          type: 'BOOLEAN',
          required: false,
        },
        {
          name: 'channel',
          description: 'Channel whose messages count toward drops and where drops post',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'threshold',
          description: 'Unique members who must chat before a card drops (5 - 500)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'start_hour',
          description: 'Drops happen from this hour (0 - 23, server time zone)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'end_hour',
          description: 'Drops stop at this hour (0 - 23, server time zone)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'claim_seconds',
          description: 'Seconds a drop stays claimable (15 - 600)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'cooldown_minutes',
          description: 'Minutes the last claimant waits before the next claim (0 - 60)',
          type: 'INTEGER',
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

      const guildId = ctx.guildId;
      if (!guildId) {
        await ctx.reply({
          content: '❌ This command can only be used in a server.',
          ephemeral: true,
        });
        return;
      }

      // Security check: server admins, or the server's TCG Manager Role.
      const memberRoles: string[] = ctx.member?.roles
        ? Array.from(
            ((ctx.member.roles as any).cache?.keys?.() ??
              (Array.isArray(ctx.member.roles) ? ctx.member.roles : [])) as Iterable<string>,
          )
        : [];
      const isServerAdmin =
        Boolean(ctx.member?.permissions.has(PermissionFlagsBits.Administrator)) ||
        Boolean(ctx.member?.permissions.has(PermissionFlagsBits.ManageGuild));

      const guildTcg = await services.guildConfigService.get(guildId, 'tcg');
      const isAuth = canManageGuildTcg({
        memberRoles,
        isServerAdmin,
        managerRoleId: guildTcg.managerRoleId,
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
        case 'drops': {
          const patch = readDropArgs(rawArgs.slice(1));
          const enabled = ctx.options.getBoolean('enabled');
          if (enabled !== null) patch.dropsEnabled = enabled;
          const channel = await ctx.options.getChannel('channel');
          if (channel) patch.dropChannelId = channel.id;
          for (const option of [
            'threshold',
            'start_hour',
            'end_hour',
            'claim_seconds',
            'cooldown_minutes',
          ] as const) {
            const value = ctx.options.getInteger(option);
            if (value !== null) patch[DROP_OPTIONS[option]] = value;
          }

          if (Object.keys(patch).length === 0) {
            await ctx.reply({
              content:
                'ℹ️ No drop settings provided. Usage: `/tcg-admin action:drops enabled:true channel:#tcg-drops threshold:30 start_hour:8 end_hour:23`',
              ephemeral: true,
            });
            return;
          }

          try {
            const { values, changes } = await services.guildConfigService.update(
              guildId,
              'tcg',
              patch,
              { userId: ctx.user.id, source: 'discord' },
            );
            const embed = new EmbedBuilder()
              .setTitle(
                changes.length > 0 ? '🃏 Card Drop Settings Updated' : '🃏 Card Drop Settings',
              )
              .setColor(0x57f287)
              .setDescription(describeDrops(values))
              .setFooter({ text: `Updated by @${ctx.user.username}` })
              .setTimestamp();
            await ctx.reply({ embeds: [embed] });
          } catch (err: unknown) {
            if (!(err instanceof GuildConfigValidationError)) throw err;
            await ctx.reply({ content: `❌ ${err.userMessage}`, ephemeral: true });
          }
          break;
        }

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
          // Holders of the role must not be able to hand it to another role.
          if (!isServerAdmin) {
            await ctx.reply({
              content: '❌ Only members with `Manage Server` can change the TCG Manager Role.',
              ephemeral: true,
            });
            return;
          }

          const rawRole = ctx.options.getString('role') ?? rawArgs[1];
          const roleId = rawRole?.replace(/[<@&>]/g, '');

          if (!roleId) {
            await ctx.reply({
              content:
                'ℹ️ Please specify a role: `/tcg-admin action:role role:@Role` (`none` removes it)',
              ephemeral: true,
            });
            return;
          }

          try {
            const { values } = await services.guildConfigService.update(
              guildId,
              'tcg',
              { managerRoleId: roleId },
              { userId: ctx.user.id, source: 'discord' },
            );

            const embed = new EmbedBuilder()
              .setTitle('🛡️ TCG Manager Role Configured')
              .setColor(0x57f287)
              .setDescription(
                values.managerRoleId
                  ? `Members with <@&${values.managerRoleId}> can now manage Waifu TCG settings in this server.`
                  : 'The TCG Manager Role was removed; only server admins can manage Waifu TCG settings here.',
              )
              .setFooter({ text: `Updated by @${ctx.user.username}` })
              .setTimestamp();

            await ctx.reply({ embeds: [embed] });
          } catch (err: unknown) {
            if (!(err instanceof GuildConfigValidationError)) throw err;
            await ctx.reply({ content: `❌ ${err.userMessage}`, ephemeral: true });
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
                  name: '🏪 Marketplace',
                  value: `• **Market Tax Rate:** \`${(configs.market_tax_rate * 100).toFixed(1)}%\``,
                  inline: false,
                },
                {
                  name: '🃏 Card Drops (this server)',
                  value: describeDrops(guildTcg),
                  inline: false,
                },
                {
                  name: '🛡️ TCG Manager Role (this server)',
                  value: guildTcg.managerRoleId
                    ? `<@&${guildTcg.managerRoleId}>`
                    : '*None configured (Server Admins only)*',
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
