import type { ActorContext } from './contracts.js';
import { AppError } from './errors.js';

/** Discord administrator permissions imply all named permissions. */
export function hasPermissions(actual: readonly string[], required: readonly string[]): boolean {
  return actual.includes('Administrator') || required.every((permission) => actual.includes(permission));
}

/** Require an authenticated guild administrator; bot ownership cannot bypass guild permissions. */
export function requireGuildManager(actor: ActorContext): string {
  if (!actor.guildId) throw new AppError('GUILD_ONLY', 'Use this command in a server.');
  if (!hasPermissions(actor.permissions, ['ManageGuild'])) {
    throw new AppError('FORBIDDEN', 'You need Manage Server permission.');
  }
  return actor.guildId;
}

/** Check role hierarchy before a moderation/role action reaches Discord. */
export function assertTargetHierarchy(input: {
  actorId: string; botId: string; targetId: string; guildOwnerId: string;
  actorHighestRole: number; botHighestRole: number; targetHighestRole: number;
}): void {
  if (input.targetId === input.guildOwnerId || input.targetId === input.botId || input.targetId === input.actorId) {
    throw new AppError('HIERARCHY', 'You cannot act on this member.');
  }
  if (input.botHighestRole <= input.targetHighestRole ||
      (input.actorId !== input.guildOwnerId && input.actorHighestRole <= input.targetHighestRole)) {
    throw new AppError('HIERARCHY', 'The member has an equal or higher role.');
  }
}
