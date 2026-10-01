import { handleHelpInteraction, type CommandRegistry, type HelpOptions } from '@ririko/discord';
import type { Client, GuildMember } from 'discord.js';
import type { CommandControllers } from './command-set.js';
import { handleGiveawayButtonInteraction, handleImagineButtonInteraction } from './index.js';
import type { BotServices } from './services.js';

export interface ComponentInteractionOptions {
  services: BotServices;
  controllers: CommandControllers;
  registry: CommandRegistry;
  helpOptions: HelpOptions;
}

/**
 * Routes button and select menu interactions that commands leave behind (adventure, music
 * controller, imagine, giveaways, reaction roles, verification, help center) by custom id.
 * Slash commands reach the command router instead.
 */
export function registerComponentInteractions(
  client: Client,
  { services, controllers, registry, helpOptions }: ComponentInteractionOptions,
): void {
  const { adventureController, musicController } = controllers;
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) {
        if (interaction.customId.startsWith('adventure:')) {
          await adventureController.button(interaction);
          return;
        }
        if (interaction.customId.startsWith('music_')) {
          await musicController.handleButtonInteraction(interaction);
          return;
        }
        if (interaction.customId.startsWith('imagine:')) {
          await handleImagineButtonInteraction(interaction, services);
          return;
        }
        if (interaction.customId.startsWith('giveaway:enter:')) {
          await handleGiveawayButtonInteraction(interaction, services);
          return;
        }
        if (interaction.customId.startsWith('rr:btn:')) {
          await services.reactionRoleService.handleButtonInteraction(interaction);
          return;
        }
        if (interaction.customId.startsWith('verify:btn:')) {
          const guild = interaction.guild;
          const member = interaction.member;
          if (guild && member) {
            const res = await services.autoRoleService.handleVerification(
              guild,
              member as GuildMember,
            );
            await interaction.reply({ content: res.message, ephemeral: true });
          }
          return;
        }
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('rr:select:')) {
          await services.reactionRoleService.handleSelectMenuInteraction(interaction);
          return;
        }
      }

      await handleHelpInteraction(interaction, registry, helpOptions);
    } catch (err) {
      console.error('Unhandled error in component interaction:', err);
    }
  });
}
