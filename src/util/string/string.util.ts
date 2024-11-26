import asdfjkl from 'asdfjkl';
import { DiscordMessage } from '#command/command.types';

export const StringUtil = {
  capitalize(str): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },
  isGibberish: isGibberish,
};

function isGibberish(message: DiscordMessage): boolean {
  const isGibberish =
    message.content.length < 5 ||
    !message.content.includes(' ') ||
    /^\d+$/.test(message.content) ||
    message.content.includes('http') ||
    message.mentions.users.size > 0 ||
    message.mentions.channels.size > 0 ||
    message.mentions.roles.size > 0 ||
    message.mentions.everyone ||
    message.reactions.cache.size > 0 ||
    message.stickers.size > 0 ||
    asdfjkl(message.content);
  return isGibberish;
}
