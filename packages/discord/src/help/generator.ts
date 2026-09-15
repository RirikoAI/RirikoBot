import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import type { CommandRegistry } from '../router/registry.js';
import type { Command, CommandCategory } from '../command/types.js';
import { CATEGORY_INFO, type HelpOptions } from './types.js';
import { resolvePermissionNames } from '../middleware/permissions.js';

export const HELP_COLORS = {
  PRIMARY: 0x5865f2,
  SUCCESS: 0x57f287,
  WARNING: 0xfee75c,
} as const;

export class HelpGenerator {
  /**
   * Generates the root Help Center home view with category summary and selection controls.
   */
  public static generateHomeView(
    registry: CommandRegistry,
    options: HelpOptions = {},
  ): {
    embed: EmbedBuilder;
    components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
  } {
    const prefix = options.defaultPrefix ?? '!';

    const embed = new EmbedBuilder()
      .setColor(HELP_COLORS.PRIMARY)
      .setTitle('✨ Ririko AI 2.0 — Interactive Help Center')
      .setDescription(
        'Welcome to **Ririko AI 2.0**! Use the category menu below to browse available commands, or type `/help command:<name>` to inspect a command directly.\n\n' +
          'All commands feature dual-dispatch parity — use them seamlessly as `/slash` commands or with prefix `' +
          `\`${prefix}\`.\n`,
      );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help:category:select')
      .setPlaceholder('Select a category to browse commands...');

    let totalCommands = 0;

    for (const [catKey, info] of Object.entries(CATEGORY_INFO)) {
      const categoryCommands = registry
        .getByCategory(catKey as CommandCategory)
        .filter((c) => !c.metadata.isHidden);

      if (categoryCommands.length === 0) {
        continue;
      }

      totalCommands += categoryCommands.length;

      embed.addFields({
        name: `${info.emoji} ${info.label} (${categoryCommands.length})`,
        value: info.description,
        inline: true,
      });

      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(info.label)
          .setValue(info.id)
          .setDescription(`${categoryCommands.length} commands available`)
          .setEmoji(info.emoji),
      );
    }

    embed.setFooter({
      text: `Prefix: ${prefix} • Total Commands: ${totalCommands} • Ririko AI 2.0.0`,
    });

    const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];
    if (selectMenu.options.length > 0) {
      components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
    }

    // Optional URL buttons row
    const linkButtons: ButtonBuilder[] = [];
    if (options.dashboardUrl) {
      linkButtons.push(
        new ButtonBuilder()
          .setLabel('Web Dashboard')
          .setStyle(ButtonStyle.Link)
          .setURL(options.dashboardUrl)
          .setEmoji('🌐'),
      );
    }
    if (options.supportServerUrl) {
      linkButtons.push(
        new ButtonBuilder()
          .setLabel('Support Server')
          .setStyle(ButtonStyle.Link)
          .setURL(options.supportServerUrl)
          .setEmoji('💬'),
      );
    }
    if (options.inviteUrl) {
      linkButtons.push(
        new ButtonBuilder()
          .setLabel('Invite Bot')
          .setStyle(ButtonStyle.Link)
          .setURL(options.inviteUrl)
          .setEmoji('➕'),
      );
    }

    if (linkButtons.length > 0) {
      components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(linkButtons));
    }

    return { embed, components };
  }

  /**
   * Generates a paginated command list for a specific module/category.
   */
  public static generateCategoryView(
    registry: CommandRegistry,
    category: CommandCategory,
    page: number = 1,
    options: HelpOptions = {},
  ): {
    embed: EmbedBuilder;
    components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
  } {
    const info = CATEGORY_INFO[category];
    const prefix = options.defaultPrefix ?? '!';
    const pageSize = Math.max(1, options.pageSize ?? 5);

    const commands = registry
      .getByCategory(category)
      .filter((c) => !c.metadata.isHidden)
      .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));

    const totalPages = Math.max(1, Math.ceil(commands.length / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);

    const startIndex = (currentPage - 1) * pageSize;
    const pageCommands = commands.slice(startIndex, startIndex + pageSize);

    const embed = new EmbedBuilder()
      .setColor(HELP_COLORS.PRIMARY)
      .setTitle(`${info.emoji} ${info.label} Commands`)
      .setDescription(
        `*${info.description}*\n\n` +
          `Browse the commands below or use \`/help command:<name>\` for deep inspection.\n`,
      );

    if (pageCommands.length === 0) {
      embed.addFields({
        name: 'No Commands Found',
        value: 'There are currently no active commands in this category.',
      });
    } else {
      for (const cmd of pageCommands) {
        const { metadata } = cmd;
        let syntax = `\`/${metadata.name}\``;
        if (metadata.aliases && metadata.aliases.length > 0) {
          syntax += ` (Prefix: \`${prefix}${metadata.name}\`, Aliases: \`${metadata.aliases.map((a) => `${prefix}${a}`).join(', ')}\`)`;
        }

        embed.addFields({
          name: `${syntax}`,
          value: metadata.description || 'No description provided.',
          inline: false,
        });
      }
    }

    embed.setFooter({
      text: `Page ${currentPage}/${totalPages} • Category: ${info.label} (${commands.length} commands)`,
    });

    // Component rows
    // Row 1: Category picker
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help:category:select')
      .setPlaceholder(`Current: ${info.label} (Select to switch)`);

    for (const [catKey, catInfo] of Object.entries(CATEGORY_INFO)) {
      const count = registry
        .getByCategory(catKey as CommandCategory)
        .filter((c) => !c.metadata.isHidden).length;
      if (count === 0) continue;

      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(catInfo.label)
          .setValue(catInfo.id)
          .setDescription(`${count} commands`)
          .setEmoji(catInfo.emoji)
          .setDefault(catInfo.id === category),
      );
    }

    // Row 2: Pagination & Navigation
    const navButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`help:page:prev:${category}:${currentPage - 1}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
        .setDisabled(currentPage <= 1),
      new ButtonBuilder()
        .setCustomId('help:home')
        .setLabel('Home')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🏠'),
      new ButtonBuilder()
        .setCustomId(`help:page:next:${category}:${currentPage + 1}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('▶️')
        .setDisabled(currentPage >= totalPages),
    );

    const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
      navButtons,
    ];

    return { embed, components };
  }

  /**
   * Generates a detailed Inspector view for a single command.
   */
  public static generateCommandDetailView(
    command: Command,
    options: HelpOptions = {},
  ): {
    embed: EmbedBuilder;
    components: ActionRowBuilder<ButtonBuilder>[];
  } {
    const { metadata } = command;
    const info = CATEGORY_INFO[metadata.category];
    const prefix = options.defaultPrefix ?? '!';

    const embed = new EmbedBuilder()
      .setColor(HELP_COLORS.PRIMARY)
      .setTitle(`Command Inspector: /${metadata.name}`)
      .setDescription(metadata.description);

    // Options signature
    let optionsSig = '';
    if (metadata.options && metadata.options.length > 0) {
      optionsSig =
        ' ' +
        metadata.options.map((opt) => (opt.required ? `<${opt.name}>` : `[${opt.name}]`)).join(' ');
    }

    // 1. Syntax
    const syntaxLines: string[] = [];
    if (metadata.slashEnabled !== false) {
      syntaxLines.push(`• **Slash**: \`/${metadata.name}${optionsSig}\``);
    }
    if (metadata.prefixEnabled !== false) {
      syntaxLines.push(`• **Prefix**: \`${prefix}${metadata.name}${optionsSig}\``);
    }
    embed.addFields({
      name: 'Syntax',
      value: syntaxLines.join('\n') || 'Disabled',
      inline: false,
    });

    // 2. Category & Aliases
    embed.addFields(
      {
        name: 'Category',
        value: `${info.emoji} ${info.label}`,
        inline: true,
      },
      {
        name: 'Aliases',
        value:
          metadata.aliases && metadata.aliases.length > 0
            ? metadata.aliases.map((a) => `\`${prefix}${a}\``).join(', ')
            : '*None*',
        inline: true,
      },
      {
        name: 'Guild Only',
        value: metadata.isGuildOnly ? 'Yes (Server Only)' : 'No (DMs Allowed)',
        inline: true,
      },
    );

    // 3. Permissions
    const userPerms =
      metadata.userPermissions && metadata.userPermissions.length > 0
        ? resolvePermissionNames(metadata.userPermissions).join(', ')
        : 'Everyone';
    const botPerms =
      metadata.botPermissions && metadata.botPermissions.length > 0
        ? resolvePermissionNames(metadata.botPermissions).join(', ')
        : 'None';

    embed.addFields(
      { name: 'Required User Permissions', value: userPerms, inline: true },
      { name: 'Required Bot Permissions', value: botPerms, inline: true },
    );

    // 4. Cooldown & Rate Limits
    const cooldownStr = metadata.cooldownSeconds ? `${metadata.cooldownSeconds} seconds` : 'None';
    const rateLimitStr = metadata.rateLimit
      ? `${metadata.rateLimit.max} uses per ${metadata.rateLimit.windowSeconds}s`
      : 'None';

    embed.addFields(
      { name: 'Cooldown', value: cooldownStr, inline: true },
      { name: 'Rate Limit', value: rateLimitStr, inline: true },
    );

    // 5. Options details
    if (metadata.options && metadata.options.length > 0) {
      const optDesc = metadata.options
        .map(
          (o) =>
            `• \`${o.name}\` (*${o.type.toLowerCase()}*, ${o.required ? 'required' : 'optional'}): ${o.description}`,
        )
        .join('\n');
      embed.addFields({ name: 'Arguments', value: optDesc, inline: false });
    }

    // 6. Examples
    if (metadata.examples && metadata.examples.length > 0) {
      embed.addFields({
        name: 'Examples',
        value: metadata.examples.map((ex) => `\`${ex}\``).join('\n'),
        inline: false,
      });
    }

    embed.setFooter({
      text: `Ririko AI 2.0 • Category: ${info.label}`,
    });

    const buttons: ButtonBuilder[] = [
      new ButtonBuilder()
        .setCustomId('help:home')
        .setLabel('Help Center')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🏠'),
      new ButtonBuilder()
        .setCustomId(`help:category:return:${metadata.category}`)
        .setLabel(`${info.label} List`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(info.emoji),
    ];

    if (options.dashboardUrl) {
      buttons.push(
        new ButtonBuilder()
          .setLabel('Configure in Dashboard')
          .setStyle(ButtonStyle.Link)
          .setURL(`${options.dashboardUrl}/modules/${metadata.category}`)
          .setEmoji('⚙️'),
      );
    }

    const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)];

    return { embed, components };
  }
}
