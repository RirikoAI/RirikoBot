import { PermissionsBitField, type GuildMember } from 'discord.js';
import type { CommandContext, Command } from '../command/types.js';
import type { CommandMiddleware, MiddlewareNext } from './types.js';
import { CommandGuildOnlyError, CommandPermissionError } from '../errors/index.js';

export interface PermissionMiddlewareOptions {
  /**
   * List of bot owner Discord User IDs who bypass ownerOnly restrictions.
   */
  ownerIds?: readonly string[] | undefined;

  /**
   * Custom evaluator to determine if a user ID belongs to a bot developer/owner.
   */
  isOwner?: ((userId: string) => boolean | Promise<boolean>) | undefined;
}

/**
 * Resolves an array of permission bitfield bigints to human-readable Discord permission names.
 */
export function resolvePermissionNames(permissions: readonly bigint[]): string[] {
  const combined = permissions.reduce((acc, curr) => acc | curr, 0n);
  return new PermissionsBitField(combined).toArray();
}

/**
 * Resolves the PermissionsBitField for the invoking user in a command context.
 * Checks guild ownership (full bypass), member.permissions, interaction memberPermissions,
 * or fetches the member from the guild.
 */
export async function resolveUserPermissions(
  ctx: CommandContext,
): Promise<PermissionsBitField | null> {
  // Guild owner always has all permissions
  if (ctx.guild && ctx.guild.ownerId === ctx.user.id) {
    return new PermissionsBitField(PermissionsBitField.All);
  }

  // 1. Direct member permissions with .has() method or bigint/string representation
  const member = ctx.member as { permissions?: PermissionsBitField | bigint | string } | null;
  if (member?.permissions) {
    if (typeof (member.permissions as PermissionsBitField).has === 'function') {
      return member.permissions as PermissionsBitField;
    }
    try {
      return new PermissionsBitField(BigInt(member.permissions.toString()));
    } catch {
      // Fall through to other resolution paths
    }
  }

  // 2. Slash interaction memberPermissions payload
  const rawInteraction = ctx.raw as { memberPermissions?: PermissionsBitField | null } | undefined;
  if (rawInteraction?.memberPermissions) {
    return rawInteraction.memberPermissions;
  }

  // 3. Fallback: Fetch guild member if in a guild
  if (ctx.guild?.members && typeof ctx.guild.members.fetch === 'function') {
    const fetched = await ctx.guild.members.fetch(ctx.user.id).catch(() => null);
    if (fetched?.permissions) {
      return fetched.permissions;
    }
  }

  return null;
}

/**
 * Resolves the bot's own GuildMember in a command context, falling back to fetchMe()
 * or fetch(client.user.id) if the cached me object is missing.
 */
export async function resolveBotMember(ctx: CommandContext): Promise<GuildMember | null> {
  if (!ctx.guild) return null;
  const members = ctx.guild.members as {
    me?: GuildMember | null;
    fetchMe?: () => Promise<GuildMember | null>;
    fetch?: (id: string) => Promise<GuildMember | null>;
  } | null;

  if (members?.me) return members.me;
  if (typeof members?.fetchMe === 'function') {
    const fetched = await members.fetchMe().catch(() => null);
    if (fetched) return fetched;
  }
  if (ctx.client?.user?.id && typeof members?.fetch === 'function') {
    return await members.fetch(ctx.client.user.id).catch(() => null);
  }
  return null;
}

/**
 * Creates Centralized Permission Middleware.
 * Enforces:
 * 1. Guild-only execution (explicit via isGuildOnly or implicit via required user/bot permissions).
 * 2. Developer/Owner-only execution (isOwnerOnly).
 * 3. Member Discord bitfield permissions (userPermissions) with guild owner bypass and fallback resolution.
 * 4. Bot client Discord bitfield permissions (botPermissions) with fallback member fetching.
 */
export function createPermissionMiddleware(
  options: PermissionMiddlewareOptions = {},
): CommandMiddleware {
  const ownerSet = new Set(options.ownerIds ?? []);

  const isUserOwner = async (userId: string): Promise<boolean> => {
    if (ownerSet.has(userId)) {
      return true;
    }
    if (options.isOwner) {
      return await options.isOwner(userId);
    }
    return false;
  };

  return async (ctx: CommandContext, next: MiddlewareNext): Promise<void> => {
    const command: Command | undefined = ctx.command;
    if (!command) {
      await next();
      return;
    }

    const { metadata } = command;

    // 1. Guild-only check (explicit or implicit via permissions)
    const requiresGuild =
      Boolean(metadata.isGuildOnly) ||
      (metadata.userPermissions !== undefined && metadata.userPermissions.length > 0) ||
      (metadata.botPermissions !== undefined && metadata.botPermissions.length > 0);

    if (requiresGuild && !ctx.guild) {
      throw new CommandGuildOnlyError('This command can only be used within a server.');
    }

    // 2. Owner-only check
    if (metadata.isOwnerOnly) {
      const isOwner = await isUserOwner(ctx.user.id);
      if (!isOwner) {
        throw new CommandPermissionError(
          'This command is restricted to bot developers and administrators.',
          { missingFor: 'user' },
        );
      }
    }

    // 3. User permissions check
    if (metadata.userPermissions && metadata.userPermissions.length > 0 && ctx.guild) {
      const permissions = await resolveUserPermissions(ctx);
      if (!permissions) {
        throw new CommandPermissionError('Unable to resolve your permissions in this server.', {
          missingFor: 'user',
        });
      }

      const missingBitfields: bigint[] = [];
      for (const perm of metadata.userPermissions) {
        if (!permissions.has(perm)) {
          missingBitfields.push(perm);
        }
      }

      if (missingBitfields.length > 0) {
        const missingNames = resolvePermissionNames(missingBitfields);
        throw new CommandPermissionError(
          `You are missing required permissions: ${missingNames.join(', ')}`,
          {
            missingPermissions: missingNames,
            missingFor: 'user',
          },
        );
      }
    }

    // 4. Bot client permissions check
    if (metadata.botPermissions && metadata.botPermissions.length > 0 && ctx.guild) {
      const botMember = await resolveBotMember(ctx);
      if (botMember?.permissions) {
        const missingBitfields: bigint[] = [];
        for (const perm of metadata.botPermissions) {
          if (!botMember.permissions.has(perm)) {
            missingBitfields.push(perm);
          }
        }

        if (missingBitfields.length > 0) {
          const missingNames = resolvePermissionNames(missingBitfields);
          throw new CommandPermissionError(
            `I am missing required permissions: ${missingNames.join(', ')}`,
            {
              missingPermissions: missingNames,
              missingFor: 'bot',
            },
          );
        }
      }
    }

    await next();
  };
}
