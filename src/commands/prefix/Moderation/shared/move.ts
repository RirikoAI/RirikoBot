/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot/
 */
const { moveTarget } = require("helpers/ModUtils");

module.exports = async ({ member }, target, reason, channel) => {
  const response = await moveTarget(member, target, reason, channel);
  if (typeof response === "boolean") {
    return `${target.user.tag} was successfully moved to: ${channel}`;
  }
  if (response === "MEMBER_PERM") {
    return `You do not have permission to disconnect ${target.user.tag}`;
  }
  if (response === "BOT_PERM") {
    return `I do not have permission to disconnect ${target.user.tag}`;
  }
  if (response === "NO_VOICE") {
    return `${target.user.tag} is not in any voice channel`;
  }
  if (response === "TARGET_PERM") {
    return `${target.user.tag} doesn't have permission to join ${channel}`;
  }
  if (response === "ALREADY_IN_CHANNEL") {
    return `${target.user.tag} is already connected to ${channel}`;
  }
  return `Failed to move ${target.user.tag} to ${channel}`;
};
