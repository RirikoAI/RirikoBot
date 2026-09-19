import type {
  Client,
  MessageReaction,
  PartialMessageReaction,
  User,
  PartialUser,
} from 'discord.js';
import type { BotServices } from '../services.js';

/**
 * Resolves potential candidate identifiers for a reaction emoji (name, id, full formatted emoji).
 */
async function resolveReactionRoleBinding(
  services: BotServices,
  messageId: string,
  reaction: MessageReaction | PartialMessageReaction,
) {
  const emoji = reaction.emoji;
  const candidates: string[] = [];
  if (emoji.name) {
    candidates.push(emoji.name);
    const stripped = emoji.name.replace(/\uFE0F/g, '');
    if (stripped !== emoji.name) candidates.push(stripped);
    candidates.push(`${stripped}\uFE0F`);
  }
  if (emoji.id) {
    candidates.push(emoji.id);
    candidates.push(`<:${emoji.name}:${emoji.id}>`);
    candidates.push(`<a:${emoji.name}:${emoji.id}>`);
  }

  for (const candidate of candidates) {
    const binding = await services.reactionRoleRepo.findByMessageAndEmoji(messageId, candidate);
    if (binding) return { binding, identifier: candidate };
  }
  return null;
}

/**
 * Gateway Reaction Listener: Listens for messageReactionAdd and messageReactionRemove
 * events, resolves partials, and applies or removes reaction roles via ReactionRoleService.
 */
export function registerReactionListener(
  client: Client,
  services: BotServices,
): void {
  // 1. Reaction Add Event
  client.on(
    'messageReactionAdd',
    async (
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser,
    ) => {
      try {
        // Resolve partials if necessary - fetch message first
        if (reaction.message.partial) {
          await reaction.message.fetch().catch(() => null);
        }
        if (reaction.partial) {
          await reaction.fetch().catch(() => null);
        }
        if (user.partial) {
          await user.fetch().catch(() => null);
        }

        // Ignore bot reactions
        if (user.bot) return;

        const guild =
          reaction.message.guild ??
          (reaction.message.guildId
            ? client.guilds.cache.get(reaction.message.guildId) ??
              (await client.guilds.fetch(reaction.message.guildId).catch(() => null))
            : null);
        if (!guild) return;

        const member =
          guild.members.cache.get(user.id) ??
          (await guild.members.fetch(user.id).catch(() => null));
        if (!member) return;

        const resolved = await resolveReactionRoleBinding(
          services,
          reaction.message.id,
          reaction,
        );
        if (!resolved) return;

        const result = await services.reactionRoleService.handleReactionAdd(
          guild,
          reaction.message.id,
          resolved.identifier,
          member,
        );

        const userTag =
          (user as any)?.tag ??
          (user as any)?.username ??
          member.user?.tag ??
          member.user?.username ??
          user.id;
        const guildName = guild.name ?? guild.id;
        const roleName = result?.roleName ?? result?.roleId;

        if (result && result.success) {
          if (result.action === 'ADDED') {
            console.log(
              `[ReactionRole] Assigned role "${roleName}" to ${userTag} in "${guildName}"`,
            );
          } else if (result.action === 'REMOVED') {
            console.log(
              `[ReactionRole] Removed role "${roleName}" from ${userTag} in "${guildName}"`,
            );
          }
        } else if (result && !result.success && result.action !== 'NOOP') {
          console.warn(
            `[ReactionRole] Failed to assign role "${roleName}" to ${userTag} in "${guildName}": ${result?.message || 'Unknown reason'}`,
          );
        }
      } catch (err) {
        console.error('[ReactionListener] Error in messageReactionAdd:', err);
      }
    },
  );

  // 2. Reaction Remove Event
  client.on(
    'messageReactionRemove',
    async (
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser,
    ) => {
      try {
        if (reaction.message.partial) {
          await reaction.message.fetch().catch(() => null);
        }
        if (reaction.partial) {
          await reaction.fetch().catch(() => null);
        }
        if (user.partial) {
          await user.fetch().catch(() => null);
        }

        if (user.bot) return;

        const guild =
          reaction.message.guild ??
          (reaction.message.guildId
            ? client.guilds.cache.get(reaction.message.guildId) ??
              (await client.guilds.fetch(reaction.message.guildId).catch(() => null))
            : null);
        if (!guild) return;

        const member =
          guild.members.cache.get(user.id) ??
          (await guild.members.fetch(user.id).catch(() => null));
        if (!member) return;

        const resolved = await resolveReactionRoleBinding(
          services,
          reaction.message.id,
          reaction,
        );
        if (!resolved) return;

        const result = await services.reactionRoleService.handleReactionRemove(
          guild,
          reaction.message.id,
          resolved.identifier,
          member,
        );

        const userTag =
          (user as any)?.tag ??
          (user as any)?.username ??
          member.user?.tag ??
          member.user?.username ??
          user.id;
        const guildName = guild.name ?? guild.id;
        const roleName = result?.roleName ?? result?.roleId;

        if (result && result.success && result.action === 'REMOVED') {
          console.log(
            `[ReactionRole] Removed role "${roleName}" from ${userTag} in "${guildName}" (unreacted)`,
          );
        } else if (result && !result.success && result.action !== 'NOOP') {
          console.warn(
            `[ReactionRole] Failed to remove role "${roleName}" from ${userTag} in "${guildName}": ${result?.message || 'Unknown reason'}`,
          );
        }
      } catch (err) {
        console.error('[ReactionListener] Error in messageReactionRemove:', err);
      }
    },
  );
}
