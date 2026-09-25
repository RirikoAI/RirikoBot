import { EmbedBuilder, PermissionFlagsBits, type Role } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';

export function parseRoleDuration(input: string): number | null {
  const match = input
    .trim()
    .match(
      /^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/i,
    );
  if (!match) return null;
  const val = parseFloat(match[1]!);
  const unit = match[2]!.toLowerCase();
  if (unit.startsWith('s')) return Math.round(val * 1000);
  if (unit.startsWith('m')) return Math.round(val * 60 * 1000);
  if (unit.startsWith('h')) return Math.round(val * 60 * 60 * 1000);
  if (unit.startsWith('d')) return Math.round(val * 24 * 60 * 60 * 1000);
  if (unit.startsWith('w')) return Math.round(val * 7 * 24 * 60 * 60 * 1000);
  return null;
}

function hasAdminPermission(ctx: CommandContext): boolean {
  if (!ctx.member) return true;
  const perms = ctx.member.permissions;
  return (
    perms.has(PermissionFlagsBits.Administrator) ||
    perms.has(PermissionFlagsBits.ManageRoles) ||
    perms.has(PermissionFlagsBits.ManageGuild)
  );
}

function resolveRole(ctx: CommandContext, optionName: string, argIndex: number): Role | null {
  if (!ctx.guild) return null;
  if (ctx.source === 'slash' && 'options' in ctx.raw) {
    const role = (ctx.raw as any).options?.getRole?.(optionName);
    if (role) return role;
  }
  const rawArgs = ctx.options.getRawArgs();
  const rawVal = ctx.options.getString(optionName) || rawArgs[argIndex];
  if (!rawVal) return null;
  const cleanId = rawVal.replace(/[<@&>]/g, '').trim();
  return (
    ctx.guild.roles.cache.get(cleanId) ||
    ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === rawVal.toLowerCase()) ||
    null
  );
}

export function createTempRoleCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'temprole',
      category: CommandCategory.UTILITY,
      description: 'Assign, remove, or list temporary expiring roles for members',
      aliases: ['temporaryrole', 'trole'],
      usage: '/temprole <action> [user] [role] [duration]',
      examples: [
        '/temprole action:add user:@User role:@Role duration:1d',
        '/temprole action:remove user:@User role:@Role',
        '/temprole action:list user:@User',
        '!temprole add @User @Role 1d',
        '!temprole remove @User @Role',
        '!temprole list',
      ],
      options: [
        {
          name: 'action',
          description: 'Temporary role action (add, remove, list)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Add (Assign temporary role with expiration)', value: 'add' },
            { name: 'Remove (Remove active temporary role)', value: 'remove' },
            { name: 'List (View active temporary roles)', value: 'list' },
          ],
        },
        {
          name: 'user',
          description: 'The target member',
          type: 'USER',
          required: false,
        },
        {
          name: 'role',
          description: 'The role to assign or remove',
          type: 'ROLE',
          required: false,
        },
        {
          name: 'duration',
          description: 'Duration before role expires (e.g. 1h, 7d, 30m, 1w)',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId || !ctx.guild) {
        await ctx.reply({ content: '❌ This command can only be used within a server.' });
        return;
      }

      if (!hasAdminPermission(ctx)) {
        await ctx.reply({
          content: '❌ You need Administrator or Manage Roles permission to use this command.',
        });
        return;
      }

      const rawArgs = ctx.options.getRawArgs();
      let action = ctx.options.getString('action')?.toLowerCase();
      if (!action) {
        const first = rawArgs[0]?.toLowerCase();
        if (['add', 'remove', 'list'].includes(first ?? '')) {
          action = first;
        } else {
          action = 'list';
        }
      }

      // Check bot manage roles permission
      if (!services.autoRoleService.hasManageRolesPermission(ctx.guild)) {
        await ctx.reply({
          content:
            '❌ I do not have the **Manage Roles** permission. Please grant it in Server Settings.',
        });
        return;
      }

      // 1. List
      if (action === 'list') {
        const userOpt = await ctx.options.getUser('user');
        const targetUserId =
          userOpt?.id || (rawArgs[1] ? rawArgs[1].replace(/[<@!>]/g, '') : undefined);

        const allTemp = await services.autoRoleRepo.listTemporaryRoles(ctx.guildId);
        const filtered = targetUserId ? allTemp.filter((r) => r.userId === targetUserId) : allTemp;

        if (filtered.length === 0) {
          await ctx.reply({
            content: targetUserId
              ? `ℹ️ No active temporary roles found for <@${targetUserId}>.`
              : 'ℹ️ No active temporary roles in this server.',
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('⏳ Active Temporary Roles')
          .setDescription(
            targetUserId
              ? `Temporary roles for <@${targetUserId}>:`
              : `All active temporary roles in **${ctx.guild.name}**:`,
          )
          .setColor('#5865F2')
          .setTimestamp();

        const display = filtered.slice(0, 25);
        for (const tr of display) {
          const expiresUnix = Math.floor(new Date(tr.expiresAt).getTime() / 1000);
          embed.addFields({
            name: `User: <@${tr.userId}>`,
            value: `• Role: <@&${tr.roleId}>\n• Expires: <t:${expiresUnix}:R> (<t:${expiresUnix}:f>)`,
            inline: false,
          });
        }

        if (filtered.length > 25) {
          embed.setFooter({
            text: `Showing 25 of ${filtered.length} temporary roles.`,
          });
        }

        await ctx.reply({ embeds: [embed] });
        return;
      }

      // 2. Add
      if (action === 'add') {
        const userOpt = await ctx.options.getUser('user');
        const role = resolveRole(ctx, 'role', 2);
        const durationStr = ctx.options.getString('duration') || rawArgs[3];

        const targetUserId = userOpt?.id || (rawArgs[1] ? rawArgs[1].replace(/[<@!>]/g, '') : null);

        if (!targetUserId || !role || !durationStr) {
          await ctx.reply({
            content:
              '❌ Missing required parameters.\nUsage: `/temprole action:add user:@User role:@Role duration:<duration>`\nExample: `/temprole action:add user:@User role:@Role duration:1d`',
          });
          return;
        }

        const durationMs = parseRoleDuration(durationStr);
        if (!durationMs || durationMs <= 0) {
          await ctx.reply({
            content:
              '❌ Invalid duration format. Use units like `30m`, `2h`, `1d`, `1w`.\nExample: `7d` for 7 days.',
          });
          return;
        }

        const member = await ctx.guild.members.fetch(targetUserId).catch(() => null);

        if (!member) {
          await ctx.reply({
            content: `❌ Member with ID \`${targetUserId}\` not found in this server.`,
          });
          return;
        }

        const result = await services.autoRoleService.assignTemporaryRole(
          ctx.guild,
          member,
          role.id,
          durationMs,
          ctx.user.id,
        );
        if (!result.success) {
          await ctx.reply({
            content: `❌ ${result.error || 'Failed to assign temporary role.'}`,
          });
          return;
        }

        const expiresUnix = Math.floor((Date.now() + durationMs) / 1000);
        const embed = new EmbedBuilder()
          .setTitle('⏳ Temporary Role Assigned')
          .setDescription(`Successfully assigned <@&${role.id}> to <@${member.id}>!`)
          .setColor('#00FF00')
          .addFields(
            { name: 'Member', value: `<@${member.id}>`, inline: true },
            { name: 'Role', value: `<@&${role.id}>`, inline: true },
            { name: 'Expires', value: `<t:${expiresUnix}:R> (<t:${expiresUnix}:f>)`, inline: true },
          )
          .setTimestamp();

        await ctx.reply({ embeds: [embed] });
        return;
      }

      // 3. Remove
      if (action === 'remove') {
        const userOpt = await ctx.options.getUser('user');
        const role = resolveRole(ctx, 'role', 2);

        const targetUserId = userOpt?.id || (rawArgs[1] ? rawArgs[1].replace(/[<@!>]/g, '') : null);

        if (!targetUserId || !role) {
          await ctx.reply({
            content:
              '❌ Missing required parameters.\nUsage: `/temprole action:remove user:@User role:@Role`',
          });
          return;
        }

        const member = await ctx.guild.members.fetch(targetUserId).catch(() => null);

        if (!member) {
          await ctx.reply({
            content: `❌ Member with ID \`${targetUserId}\` not found in this server.`,
          });
          return;
        }

        const success = await services.autoRoleService.removeTemporaryRole(
          ctx.guild,
          member,
          role.id,
        );
        if (!success) {
          await ctx.reply({
            content: `❌ Failed to remove temporary role <@&${role.id}> from <@${member.id}>.`,
          });
          return;
        }

        await ctx.reply({
          content: `✅ Successfully removed temporary role <@&${role.id}> from <@${member.id}>.`,
        });
      }
    },
  };
}
