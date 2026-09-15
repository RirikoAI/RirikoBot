import { PermissionsBitField } from 'discord.js';
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
 * Creates Centralized Permission Middleware.
 * Enforces:
 * 1. Guild-only execution (isGuildOnly).
 * 2. Developer/Owner-only execution (isOwnerOnly).
 * 3. Member Discord bitfield permissions (userPermissions).
 * 4. Bot client Discord bitfield permissions (botPermissions).
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

    // 1. Guild-only check
    if (metadata.isGuildOnly && !ctx.guild) {
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
    if (metadata.userPermissions && metadata.userPermissions.length > 0 && ctx.member) {
      const missingBitfields: bigint[] = [];
      for (const perm of metadata.userPermissions) {
        if (!ctx.member.permissions.has(perm)) {
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
      const botMember = ctx.guild.members.me;
      if (botMember) {
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
