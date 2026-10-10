import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { runWelcomerCardCommand } from './welcomer-card.js';

export function createFarewellCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'farewell',
      registrationScope: 'guild',
      category: CommandCategory.UTILITY,
      description: 'Configure the server farewell message and card',
      aliases: ['goodbye'],
      usage: '/farewell [channel] [message] [background] [color] [text] [enable]',
      examples: [
        '/farewell',
        '/farewell channel:#goodbye',
        '/farewell message:Goodbye {user}!',
        '/farewell background:https://example.com/bg.png',
        '/farewell color:#ff0000',
        '/farewell text:Please read #rules, {user}!',
        '/farewell text:none',
        '/farewell enable:false',
      ],
      options: [
        {
          name: 'channel',
          description: 'The channel to send farewell messages in',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'message',
          description: 'The farewell message template ({user}, {server}, {memberCount})',
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
          description: 'Hex color for the farewell card text and border',
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
          description: 'Enable or disable the farewell messages',
          type: 'BOOLEAN',
          required: false,
        },
      ],
    },

    async execute(ctx: CommandContext): Promise<void> {
      await runWelcomerCardCommand(ctx, services, 'farewell');
    },
  };
}
