const { getReactionRoles } = require("app/Schemas/ReactionRoles");

/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot/
 * @param {import('discord.js').MessageReaction} reaction
 * @param {import('discord.js').User} user
 */
export const handleReactionAdd = async (reaction, user) => {
  const role = await getRole(reaction);
  if (!role) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  if (!member) return;

  await member.roles.add(role).catch(() => {});
};

/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot/
 * @param {import('discord.js').MessageReaction} reaction
 * @param {import('discord.js').User} user
 */
export const handleReactionRemove = async (reaction, user) => {
  const role = await getRole(reaction);
  if (!role) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  if (!member) return;

  await member.roles.remove(role).catch(() => {});
};

/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot/
 * @param {import('discord.js').MessageReaction} reaction
 */
async function getRole(reaction) {
  const { message, emoji } = reaction;
  if (!message || !message.channel) return;

  const rr = getReactionRoles(message.guildId, message.channelId, message.id);
  const emote = emoji.id ? emoji.id : emoji.toString();
  const found = rr.find((doc) => doc.emote === emote);

  const reactionRole = found
    ? await message.guild.roles.fetch(found.role_id)
    : null;
  return reactionRole;
}
