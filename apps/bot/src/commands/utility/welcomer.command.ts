import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { runWelcomerCardCommand } from './welcomer-card.js';

export function createWelcomerCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'welcomer',
      registrationScope: 'guild',
      category: CommandCategory.UTILITY,
      description: 'Configure the server welcome message and card',
      aliases: ['welcome'],
      usage: '/welcomer [channel] [message] [background] [color] [text] [enable]',
      examples: [
        '/welcomer',
        '/welcomer channel:#welcome',
        '/welcomer message:Welcome {user} to {server}!',
        '/welcomer background:https://example.com/bg.png',
        '/welcomer color:#ff0000',
        '/welcomer text:Please read #rules, {user}!',
        '/welcomer text:none',
        '/welcomer enable:false',
      ],
      options: [
        {
          name: 'channel',
          description: 'The channel to send welcome messages in',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'message',
          description: 'The welcome message template ({user}, {server}, {memberCount})',
          type: 'STRING',
          required: false,
        },
        {
          name: 'background',
          description: 'Public http(s) link to the card background image, or none',
          type: 'STRING',
          required: false,
        },
        {
          name: 'color',
          description: 'Hex color for the welcome card text and border',
          type: 'STRING',
          required: false,
        },
        {
          name: 'text',
          description: 'Text sent with the card ({user}, {username}, {server}, #channel), or none',
          type: 'STRING',
          required: false,
        },
        {
          name: 'enable',
          description: 'Enable or disable the welcomer',
          type: 'BOOLEAN',
          required: false,
        },
      ],
    },

    async execute(ctx: CommandContext): Promise<void> {
      await runWelcomerCardCommand(ctx, services, 'welcome');
    },
  };
}
