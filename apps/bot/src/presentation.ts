import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, type MessageCreateOptions,
} from 'discord.js';
import type { CommandResult, HelpResult } from '@ririko/discord';

/** Render domain results using a consistent Discord presentation. */
export function presentResult(result: CommandResult, helpSessionId?: string): Pick<MessageCreateOptions, 'embeds' | 'components' | 'allowedMentions'> {
  const embed = new EmbedBuilder()
    .setColor(result.kind === 'error' ? 0xd64b64 : 0x9775fa)
    .setDescription(result.content.slice(0, 4096));
  if (result.kind !== 'help') return { embeds: [embed], allowedMentions: { parse: [], repliedUser: false } };
  embed.setTitle('Ririko Help').setFooter({ text: `Page ${result.page} of ${result.pageCount} · ${result.total} commands` });
  return {
    embeds: [embed],
    ...(helpSessionId ? { components: helpComponents(result, helpSessionId) } : {}),
    allowedMentions: { parse: [], repliedUser: false },
  };
}

function helpComponents(result: HelpResult, sessionId: string): Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> {
  const options = [
    { label: 'All categories', value: 'all', default: result.category === null },
    ...result.categories.slice(0, 24).map((category) => ({ label: category, value: category, default: category === result.category })),
  ];
  const menu = new StringSelectMenuBuilder().setCustomId(`help:${sessionId}:category`).setPlaceholder('Choose a category').addOptions(options);
  const previous = new ButtonBuilder().setCustomId(`help:${sessionId}:previous`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(result.page <= 1);
  const next = new ButtonBuilder().setCustomId(`help:${sessionId}:next`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(result.page >= result.pageCount);
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu), new ActionRowBuilder<ButtonBuilder>().addComponents(previous, next)];
}
