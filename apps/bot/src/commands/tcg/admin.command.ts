import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { TcgRules } from '@ririko/core';
import type { BotServices } from '../../services.js';
import { canManageGuildTcg, GuildConfigValidationError } from '@ririko/services';

/** `key:value` options and the setting each one sets. */
type OptionMap = Readonly<Record<string, string>>;

/** `/tcg-admin action:drops` options and the `tcg` guild settings they set. */
const DROP_OPTIONS = {
  enabled: 'dropsEnabled',
  channel: 'dropChannelId',
  threshold: 'dropMessageThreshold',
  start_hour: 'dropStartHour',
  end_hour: 'dropEndHour',
  claim_seconds: 'dropClaimTimeoutSeconds',
  cooldown_minutes: 'dropCooldownMinutes',
} as const;

/** `/tcg-admin action:energy` options and the global TCG rules they set. */
const ENERGY_OPTIONS = {
  max_cap: 'globalMaxEnergyCap',
  base_capacity: 'baseEnergyCapacity',
  level_scaling: 'energyScalingPerLevel',
  pot_limit: 'dailyEnergyPotionLimit',
  bonus_cap: 'maxBonusEnergyCap',
  bonus_increment: 'dailyBonusEnergyIncrement',
} as const;

/** `/tcg-admin action:market` options and the global TCG rules they set. */
const MARKET_OPTIONS = {
  tax_percent: 'marketTaxPercent',
  listing_days: 'listingExpiryDays',
} as const;

/** Actions that change rules for every server; only bot owners may run them. */
const GLOBAL_ACTIONS = new Set(['energy', 'market']);

/** Reads `key:value` prefix arguments into settings; `<#id>` channels become IDs. */
function readKeyValueArgs(rawArgs: readonly string[], options: OptionMap): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const arg of rawArgs) {
    const separator = arg.indexOf(':');
    if (separator <= 0) continue;
    const key = arg.slice(0, separator).toLowerCase();
    if (!Object.hasOwn(options, key)) continue;
    patch[options[key]!] = arg.slice(separator + 1).replace(/^<#(\d+)>$/, '$1');
  }
  return patch;
}

/** Adds the integer slash options that were given to `patch`. */
function readIntegerOptions(
  ctx: CommandContext,
  options: OptionMap,
  patch: Record<string, unknown>,
) {
  for (const [option, setting] of Object.entries(options)) {
    const value = ctx.options.getInteger(option);
    if (value !== null) patch[setting] = value;
  }
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

function describeEnergy(rules: TcgRules): string {
  return (
    `• **Base Capacity:** \`${rules.baseEnergyCapacity}\`\n` +
    `• **Max Cap:** \`${rules.globalMaxEnergyCap}\`\n` +
    `• **Scaling Per Level:** \`+${rules.energyScalingPerLevel}\`\n` +
    `• **Max Bonus Cap:** \`${rules.maxBonusEnergyCap}\`\n` +
    `• **Daily Bonus Increment:** \`+${rules.dailyBonusEnergyIncrement}\`\n` +
    `• **Daily Potions Limit:** \`${rules.dailyEnergyPotionLimit}\``
  );
}

function describeMarket(rules: TcgRules): string {
  return (
    `• **Market Tax:** \`${rules.marketTaxPercent}%\`\n` +
    `• **Listing Expiry:** \`${rules.listingExpiryDays} days\``
  );
}

export function createTcgAdminCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'tcg-admin',
      category: CommandCategory.TCG,
      description:
        'TCG Administration: Manage card drops and the TCG Manager Role here; bot owners manage global energy and market rules.',
      aliases: ['tcgadmin', 'tcgconfig'],
      usage: '/tcg-admin [action: view|drops|role|energy|market] [value]',
      examples: [
        '/tcg-admin action:view',
        '/tcg-admin action:drops enabled:true channel:#tcg-drops threshold:30',
        '/tcg-admin action:role role:@TCGManager',
        '/tcg-admin action:energy max_cap:350 pot_limit:5 bonus_cap:50 bonus_increment:5',
        '/tcg-admin action:market tax_percent:5 listing_days:7',
      ],
      options: [
        {
          name: 'action',
          description: 'Admin action (view, drops, role, energy, market)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'View (View current TCG configuration)', value: 'view' },
            { name: 'Drops (Configure card drops in this server)', value: 'drops' },
            { name: 'Role (Configure this server TCG Manager Role)', value: 'role' },
            { name: 'Energy (Bot owners: global energy rules)', value: 'energy' },
            { name: 'Market (Bot owners: global market tax & expiry)', value: 'market' },
          ],
        },
        {
          name: 'max_cap',
          description: 'Bot owners: global max energy cap (100 - 1000)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'base_capacity',
          description: 'Bot owners: energy capacity at level 1 (50 - 200)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'level_scaling',
          description: 'Bot owners: extra energy capacity per level (1 - 5)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'pot_limit',
          description: 'Bot owners: daily stamina potion usage limit (1 - 10)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'bonus_cap',
          description: 'Bot owners: most bonus energy a player can bank (0 - 500)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'bonus_increment',
          description: 'Bot owners: bonus energy added at each daily reset (0 - 50)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'tax_percent',
          description: 'Bot owners: marketplace tax in percent (1 - 20)',
          type: 'INTEGER',
          required: false,
        },
        {
          name: 'listing_days',
          description: 'Bot owners: days a market listing stays up (1 - 30)',
          type: 'INTEGER',
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
      const rawArgs = ctx.options.getRawArgs?.() ?? [];
      const action =
        ctx.options.getString('action')?.toLowerCase() ?? rawArgs[0]?.toLowerCase() ?? 'view';

      // Global rules apply to every server, so server permissions are not enough for them.
      if (GLOBAL_ACTIONS.has(action)) {
        if (!services.botOwnerIds.includes(ctx.user.id)) {
          await ctx.reply({
            content:
              '❌ **Access Denied:** Energy and market rules apply to every server, so only the bot owner can change them.',
            ephemeral: true,
          });
          return;
        }
        const options = action === 'energy' ? ENERGY_OPTIONS : MARKET_OPTIONS;
        const patch = readKeyValueArgs(rawArgs.slice(1), options);
        readIntegerOptions(ctx, options, patch);
        if (Object.keys(patch).length === 0) {
          await ctx.reply({
            content:
              action === 'energy'
                ? 'ℹ️ No energy rules provided. Usage: `/tcg-admin action:energy max_cap:350 base_capacity:100 level_scaling:2 pot_limit:5 bonus_cap:50 bonus_increment:5`'
                : 'ℹ️ No market rules provided. Usage: `/tcg-admin action:market tax_percent:5 listing_days:7`',
            ephemeral: true,
          });
          return;
        }
        try {
          const { values, changes } = await services.tcgRulesService.update(patch, {
            userId: ctx.user.id,
            source: 'discord',
          });
          const title = action === 'energy' ? '⚡ Energy Rules' : '🏪 Market Rules';
          const embed = new EmbedBuilder()
            .setTitle(changes.length > 0 ? `${title} Updated` : title)
            .setColor(0x57f287)
            .setDescription(action === 'energy' ? describeEnergy(values) : describeMarket(values))
            .setFooter({ text: `Updated by @${ctx.user.username} • applies to every server` })
            .setTimestamp();
          await ctx.reply({ embeds: [embed] });
        } catch (err: unknown) {
          if (!(err instanceof GuildConfigValidationError)) throw err;
          await ctx.reply({ content: `❌ ${err.userMessage}`, ephemeral: true });
        }
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

      switch (action) {
        case 'drops': {
          const patch = readKeyValueArgs(rawArgs.slice(1), DROP_OPTIONS);
          const enabled = ctx.options.getBoolean('enabled');
          if (enabled !== null) patch.dropsEnabled = enabled;
          const channel = await ctx.options.getChannel('channel');
          if (channel) patch.dropChannelId = channel.id;
          const { enabled: _enabled, channel: _channel, ...integerOptions } = DROP_OPTIONS;
          readIntegerOptions(ctx, integerOptions, patch);

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
          const rules = await services.tcgRulesService.getRules();
          const embed = new EmbedBuilder()
            .setTitle('⚙️ Waifu TCG Configuration')
            .setColor(0x5865f2)
            .setDescription(
              'Card drops and the TCG Manager Role belong to this server. Energy and market rules apply to every server and only the bot owner can change them.',
            )
            .addFields(
              { name: '🃏 Card Drops (this server)', value: describeDrops(guildTcg) },
              {
                name: '🛡️ TCG Manager Role (this server)',
                value: guildTcg.managerRoleId
                  ? `<@&${guildTcg.managerRoleId}>`
                  : '*None configured (Server Admins only)*',
              },
              { name: '⚡ Energy (global)', value: describeEnergy(rules) },
              { name: '🏪 Marketplace (global)', value: describeMarket(rules) },
            )
            .setFooter({ text: 'Governance & Administration • Ririko AI 2.0' })
            .setTimestamp();

          await ctx.reply({ embeds: [embed] });
          break;
        }
      }
    },
  };
}
