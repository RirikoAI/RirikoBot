import { EmbedBuilder, PermissionFlagsBits, type GuildMember, type Role } from 'discord.js';
import { describeErrorForLog, type LevelRoleReward } from '@ririko/core';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import { GuildConfigValidationError } from '@ririko/services';
import type { BotServices } from '../../services.js';

export const LEVEL_ROLE_ACTIONS = ['list', 'add', 'remove', 'sync'] as const;
export type LevelRoleAction = (typeof LEVEL_ROLE_ACTIONS)[number];

const USAGE =
  'Usage: `/levelroles action:list|add|remove|sync`. Examples: `!levelroles add 5 @Regular`, `!levelroles remove 5`, `!levelroles sync`.';
const NO_PERMISSION =
  'You need the Manage Roles, Manage Server or Administrator permission to change level role rewards.';
const NO_BOT_PERMISSION =
  'I do not have the **Manage Roles** permission. Give it to me in Server Settings, then try again.';
const DASHBOARD_HINT = 'You can also edit them on the **XP & Ranking** page of the dashboard.';

const ROLE_ARG = /^(?:<@&)?(\d{17,20})>?$/;
const LEVEL_ARG = /^\d{1,9}$/;

/** What the member asked for, the same shape for a slash command and a prefix command. */
interface LevelRoleRequest {
  action: string | null;
  /** Null when no level was given or it is not a whole number. */
  level: number | null;
  /** The role text a prefix command carried, or the name of a slash role; null when none. */
  roleText: string | null;
  role: Role | null;
}

function canManage(member: GuildMember | null): boolean {
  if (!member) return false;
  const perms = member.permissions;
  return (
    perms.has(PermissionFlagsBits.Administrator) ||
    perms.has(PermissionFlagsBits.ManageRoles) ||
    perms.has(PermissionFlagsBits.ManageGuild)
  );
}

function findRole(ctx: CommandContext, text: string): Role | null {
  const roles = ctx.guild!.roles.cache;
  const id = text.match(ROLE_ARG)?.[1];
  if (id) return roles.get(id) ?? null;
  const name = text.toLowerCase();
  return roles.find((role) => role.name.toLowerCase() === name) ?? null;
}

/**
 * Reads the action, level and role. A slash command carries typed options. A prefix command is
 * `!levelroles <action> <level> <role>`, where the role may be a mention, an ID or a name that
 * contains spaces.
 */
function readRequest(ctx: CommandContext): LevelRoleRequest {
  if (ctx.source === 'slash') {
    const options = 'options' in ctx.raw ? ctx.raw.options : null;
    const role =
      options && 'getRole' in options ? ((options.getRole('role') as Role | null) ?? null) : null;
    return {
      action: ctx.options.getString('action')?.toLowerCase() ?? null,
      level: ctx.options.getInteger('level'),
      roleText: role?.id ?? null,
      role,
    };
  }

  const args = ctx.options.getRawArgs();
  const levelText = args[1];
  const roleText = args.slice(2).join(' ').trim();
  return {
    action: args[0]?.toLowerCase() ?? null,
    level: levelText && LEVEL_ARG.test(levelText) ? Number(levelText) : null,
    roleText: roleText || null,
    role: roleText ? findRole(ctx, roleText) : null,
  };
}

/** Ephemeral for slash commands; a prefix command has no private replies and ignores the flag. */
async function say(ctx: CommandContext, content: string, ephemeral = true): Promise<void> {
  await ctx.reply({ content, ephemeral, allowedMentions: { parse: [] } });
}

/** The schema's messages without the row number, which means nothing for a single reward. */
function describeValidationError(error: GuildConfigValidationError): string {
  return Object.values(error.fieldErrors)
    .flat()
    .map((message) => message.replace(/^Row \d+: /, ''))
    .join(' ');
}

async function listRewards(ctx: CommandContext, services: BotServices): Promise<void> {
  const guild = ctx.guild!;
  const { rewards, keepPreviousRoles } = await services.guildConfigService.get(
    guild.id,
    'levelroles',
  );

  if (rewards.length === 0) {
    await say(
      ctx,
      `This server has no level role rewards yet. Add one with \`/levelroles action:add level:5 role:@Role\`. ${DASHBOARD_HINT}`,
      false,
    );
    return;
  }

  const lines = rewards.map((reward) => {
    const missing = guild.roles.cache.has(reward.roleId) ? '' : ' (this role was deleted)';
    return `Level **${reward.level}**: <@&${reward.roleId}>${missing}`;
  });
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('Level role rewards')
    .setDescription(lines.join('\n'))
    .setFooter({
      text: keepPreviousRoles
        ? 'Members keep the roles of lower levels.'
        : 'Members keep only the role of the highest level they reached.',
    });
  await ctx.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function saveRewards(
  ctx: CommandContext,
  services: BotServices,
  rewards: LevelRoleReward[],
): Promise<boolean> {
  try {
    await services.guildConfigService.update(
      ctx.guildId!,
      'levelroles',
      { rewards },
      { userId: ctx.user.id, source: 'discord' },
    );
    return true;
  } catch (error) {
    if (!(error instanceof GuildConfigValidationError)) throw error;
    await say(ctx, describeValidationError(error));
    return false;
  }
}

async function addReward(
  ctx: CommandContext,
  services: BotServices,
  request: LevelRoleRequest,
): Promise<void> {
  const guild = ctx.guild!;
  if (request.level === null || !request.roleText) {
    await say(ctx, `Say which level and which role. ${USAGE}`);
    return;
  }
  if (!request.role) {
    await say(ctx, 'I could not find that role. Mention it or type its exact name.');
    return;
  }

  const role = request.role;
  const check = services.autoRoleService.isValidAssignableRole(guild, role.id);
  if (!check.valid) {
    await say(
      ctx,
      `I cannot give <@&${role.id}> as a reward. ${check.reason ?? 'Pick another role.'} It must not be @everyone or managed by an integration, and it must be below my highest role.`,
    );
    return;
  }

  const { rewards } = await services.guildConfigService.get(guild.id, 'levelroles');
  const previous = rewards.find((reward) => reward.level === request.level);
  const next = [
    ...rewards.filter((reward) => reward.level !== request.level),
    { level: request.level, roleId: role.id },
  ];
  if (!(await saveRewards(ctx, services, next))) return;

  const replaced =
    previous && previous.roleId !== role.id ? ` It replaces <@&${previous.roleId}>.` : '';
  const permission = services.autoRoleService.hasManageRolesPermission(guild)
    ? ''
    : `\n${NO_BOT_PERMISSION}`;
  await say(
    ctx,
    `Members who reach level **${request.level}** will get <@&${role.id}>.${replaced} Run \`/levelroles action:sync\` to give it to members who are already there.${permission}`,
    false,
  );
}

async function removeReward(
  ctx: CommandContext,
  services: BotServices,
  request: LevelRoleRequest,
): Promise<void> {
  if (request.level === null) {
    await say(ctx, `Say which level to remove. ${USAGE}`);
    return;
  }
  const { rewards } = await services.guildConfigService.get(ctx.guildId!, 'levelroles');
  const removed = rewards.find((reward) => reward.level === request.level);
  if (!removed) {
    await say(ctx, `Level ${request.level} has no reward.`);
    return;
  }
  if (
    !(await saveRewards(
      ctx,
      services,
      rewards.filter((reward) => reward !== removed),
    ))
  )
    return;

  await say(
    ctx,
    `Level **${request.level}** no longer gives <@&${removed.roleId}>. Members keep the role they already have.`,
    false,
  );
}

async function syncRewards(ctx: CommandContext, services: BotServices): Promise<void> {
  const guild = ctx.guild!;
  if (!services.autoRoleService.hasManageRolesPermission(guild)) {
    await say(ctx, NO_BOT_PERMISSION);
    return;
  }
  const { rewards } = await services.guildConfigService.get(guild.id, 'levelroles');
  if (rewards.length === 0) {
    await say(ctx, `There are no level role rewards to give. Add one first. ${DASHBOARD_HINT}`);
    return;
  }

  await say(
    ctx,
    'Sync started. I am checking the members who have reached a reward level. This can take a while on a big server.',
    false,
  );

  let message: string;
  try {
    const result = await services.levelRoleService.syncGuild(guild);
    message = result.busy
      ? 'A sync is already running in this server. Wait for it to finish, then try again.'
      : `Sync finished. I checked **${result.checked}** members, added **${result.added}** roles and removed **${result.removed}** roles.`;
  } catch (error) {
    console.error(`[LevelRoles] Sync failed in ${guild.id}: ${describeErrorForLog(error)}`);
    message = 'The sync stopped because of an error. Try again later.';
  }

  const payload = { content: message, allowedMentions: { parse: [] as never[] } };
  try {
    await ctx.followUp(payload);
  } catch (error) {
    // A slash reply token lasts 15 minutes; a long sync can outlive it, so post in the channel.
    try {
      await ctx.send(payload);
    } catch (sendError) {
      console.error(
        `[LevelRoles] Could not report a sync in ${guild.id}: ${describeErrorForLog(error)}; ${describeErrorForLog(sendError)}`,
      );
    }
  }
}

export function createLevelRolesCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'levelroles',
      registrationScope: 'guild',
      category: CommandCategory.UTILITY,
      description: 'Roles given automatically at chosen levels: list, add, remove and sync',
      aliases: ['levelrole', 'level-roles', 'level-role'],
      isGuildOnly: true,
      usage: '/levelroles <list|add|remove|sync> [level] [role]',
      examples: [
        '/levelroles action:list',
        '/levelroles action:add level:5 role:@Regular',
        '/levelroles action:remove level:5',
        '/levelroles action:sync',
        '!levelroles',
        '!levelroles add 5 @Regular',
        '!levelroles remove 5',
        '!levelroles sync',
      ],
      options: [
        {
          name: 'action',
          description: 'What to do (default: list)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'List (show the rewards)', value: 'list' },
            { name: 'Add (give a role at a level)', value: 'add' },
            { name: 'Remove (stop rewarding a level)', value: 'remove' },
            { name: 'Sync (give the roles to members who already have the level)', value: 'sync' },
          ],
        },
        {
          name: 'level',
          description: 'The level, from 1 to 1000 (for add and remove)',
          type: 'INTEGER',
          required: false,
          minValue: 1,
          maxValue: 1000,
        },
        {
          name: 'role',
          description: 'The role to give at that level (for add)',
          type: 'ROLE',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId || !ctx.guild) {
        await say(ctx, 'This command can only be used within a server.');
        return;
      }

      const request = readRequest(ctx);
      const action = request.action ?? 'list';
      if (!(LEVEL_ROLE_ACTIONS as readonly string[]).includes(action)) {
        await say(ctx, USAGE);
        return;
      }

      if (action === 'list') {
        await listRewards(ctx, services);
        return;
      }
      if (!canManage(ctx.member)) {
        await say(ctx, NO_PERMISSION);
        return;
      }

      if (action === 'add') await addReward(ctx, services, request);
      else if (action === 'remove') await removeReward(ctx, services, request);
      else await syncRewards(ctx, services);
    },
  };
}
