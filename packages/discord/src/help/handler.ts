import type { Interaction } from 'discord.js';
import type { CommandRegistry } from '../router/registry.js';
import type { CommandCategory } from '../command/types.js';
import { HelpGenerator } from './generator.js';
import type { HelpOptions } from './types.js';

/**
 * Handles incoming Discord component interactions (select menus, buttons) for the interactive Help Center.
 * Returns true if the interaction was handled by the help system, false otherwise.
 */
export async function handleHelpInteraction(
  interaction: Interaction,
  registry: CommandRegistry,
  options: HelpOptions = {},
): Promise<boolean> {
  // 1. Handle Category Select Menu
  if (interaction.isStringSelectMenu() && interaction.customId === 'help:category:select') {
    const selectedCategory = interaction.values[0] as CommandCategory | undefined;
    if (!selectedCategory) {
      return false;
    }

    const { embed, components } = HelpGenerator.generateCategoryView(
      registry,
      selectedCategory,
      1,
      options,
    );

    await interaction.update({ embeds: [embed], components });
    return true;
  }

  // 2. Handle Action Buttons
  if (interaction.isButton()) {
    // 2.1 Return to Home View
    if (interaction.customId === 'help:home') {
      const { embed, components } = HelpGenerator.generateHomeView(registry, options);
      await interaction.update({ embeds: [embed], components });
      return true;
    }

    // 2.2 Pagination: Previous / Next
    if (
      interaction.customId.startsWith('help:page:prev:') ||
      interaction.customId.startsWith('help:page:next:')
    ) {
      const parts = interaction.customId.split(':');
      const category = parts[3] as CommandCategory | undefined;
      const page = parseInt(parts[4] ?? '1', 10);

      if (!category || Number.isNaN(page)) {
        return false;
      }

      const { embed, components } = HelpGenerator.generateCategoryView(
        registry,
        category,
        page,
        options,
      );

      await interaction.update({ embeds: [embed], components });
      return true;
    }

    // 2.3 Return to Category List from Inspector
    if (interaction.customId.startsWith('help:category:return:')) {
      const parts = interaction.customId.split(':');
      const category = parts[3] as CommandCategory | undefined;
      if (!category) {
        return false;
      }

      const { embed, components } = HelpGenerator.generateCategoryView(
        registry,
        category,
        1,
        options,
      );

      await interaction.update({ embeds: [embed], components });
      return true;
    }
  }

  return false;
}
