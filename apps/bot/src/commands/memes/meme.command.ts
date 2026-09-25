import type { AutocompleteInteraction } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import {
  getMemeTemplate,
  searchMemeTemplates,
  MEME_TEMPLATE_NAMES,
  type MemeTemplateConfig,
} from '@ririko/services';
import type { BotServices } from '../../services.js';
import { resolveContextPrefix } from '../shared/prefix-resolver.js';

const COMMAND_NAME = 'meme';

/**
 * Legacy prefix aliases: all 11 legacy template names (plus common aliases like `alwaysbeen`)
 * double as direct `!<template>` shortcuts, preserving 100% parity with Ririko 1.4.0.
 */
const MEME_PREFIX_ALIASES = [
  '0days',
  'allmyhomies',
  'always-been',
  'alwaysbeen',
  'american-chopper',
  'chad',
  'everywhere',
  'getting-paid',
  'got-any-more',
  'train-bus',
  'undertaker',
  'woman-yelling-at-cat',
];

const MAX_AUTOCOMPLETE_LENGTH = 100;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function parsePrefixTexts(rawArgs: readonly string[], template?: MemeTemplateConfig): string[] {
  if (rawArgs.length === 0) return [];

  const rawJoined = rawArgs.join(' ').trim();

  // 1. Pipe delimiter format: `text 1 | text 2 | text 3`
  if (rawJoined.includes('|')) {
    return rawJoined
      .split('|')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  // 2. Tokenized args (e.g. ["quoted text 1", "quoted text 2"] or single words)
  const maxBoxes = template?.textBoxes.length ?? 2;
  if (rawArgs.length <= maxBoxes) {
    return rawArgs.map((a) => a.trim()).filter(Boolean);
  }

  // 3. More unquoted words than boxes: assign the entire joined string to the first box
  return [rawJoined];
}

function buildUnknownTemplateMessage(attempted: string, prefix: string): string {
  const suggestions = attempted ? searchMemeTemplates(attempted, 5).map((t) => t.name) : [];
  const lines = [
    attempted
      ? `❌ \`${attempted}\` is not a known meme template.`
      : '❌ Please specify which meme template to generate.',
  ];

  if (suggestions.length > 0) {
    lines.push(`Did you mean: ${suggestions.map((s) => `\`${s}\``).join(', ')}?`);
  }

  lines.push(
    `Available templates (${MEME_TEMPLATE_NAMES.length}): ${MEME_TEMPLATE_NAMES.map((n) => `\`${n}\``).join(', ')}`,
    `Usage: \`/meme template:<template> text1:<text> [text2]...\` or \`${prefix}meme <template> text1 | text2\`.`,
    `Legacy shortcuts like \`${prefix}0days text1 | text2\` or \`${prefix}chad "text 1" "text 2"\` work too!`,
  );
  return lines.join('\n');
}

/**
 * Creates the unified dual-dispatch `/meme` command with autocomplete for all 11 legacy templates
 * and prefix alias routing for 100% backwards compatibility with Ririko 1.4.0.
 */
export function createMemeCommand(services: BotServices): Command {
  return {
    metadata: {
      name: COMMAND_NAME,
      category: CommandCategory.MEMES,
      description:
        'Generate dynamic memes using classic templates (0days, chad, chopper, cat, etc.)',
      aliases: MEME_PREFIX_ALIASES,
      usage:
        '/meme template:<template> text1:<text> [text2] [text3]... | !meme <template> text1 | text2 | !0days text1 | text2',
      examples: [
        '/meme template:0days text1:No Accidents text2:Since Fariz Joined',
        '!meme 0days No Accidents | Since Fariz Joined',
        '!0days No Accidents | Since Fariz Joined',
        '!chad "Average JS User" "Average TS Enjoyer"',
        '!american-chopper Panel 1 | Panel 2 | Panel 3 | Panel 4 | Panel 5',
      ],
      cooldownSeconds: 3,
      options: [
        {
          name: 'template',
          description: 'Meme template (e.g. 0days, chad, american-chopper, woman-yelling-at-cat)',
          type: 'STRING',
          required: true,
          autocomplete: true,
        },
        {
          name: 'text1',
          description: 'Primary caption / first panel text',
          type: 'STRING',
          required: true,
        },
        {
          name: 'text2',
          description: 'Secondary caption / second panel text',
          type: 'STRING',
          required: false,
        },
        {
          name: 'text3',
          description: 'Third panel text (for multi-panel memes like American Chopper)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'text4',
          description: 'Fourth panel text (for multi-panel memes like American Chopper)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'text5',
          description: 'Fifth panel text (for multi-panel memes like American Chopper)',
          type: 'STRING',
          required: false,
        },
      ],
    },

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
      const focused = interaction.options.getFocused();
      const matches = searchMemeTemplates(focused, 25);
      await interaction.respond(
        matches.map((template) => ({
          name: truncate(
            `${template.title} (${template.name}) — ${template.description}`,
            MAX_AUTOCOMPLETE_LENGTH,
          ),
          value: template.id,
        })),
      );
    },

    async execute(ctx: CommandContext): Promise<void> {
      let templateName: string;
      let texts: string[];

      if (ctx.source === 'slash') {
        templateName = (ctx.options.getString('template', true) ?? '').trim();
        texts = [
          ctx.options.getString('text1', true) ?? '',
          ctx.options.getString('text2') ?? '',
          ctx.options.getString('text3') ?? '',
          ctx.options.getString('text4') ?? '',
          ctx.options.getString('text5') ?? '',
        ].filter(Boolean);
      } else {
        const rawArgs = ctx.options.getRawArgs();
        if (ctx.invokedName === COMMAND_NAME) {
          // Canonical dispatch: `!meme <template> <text1> | <text2>...`
          templateName = (rawArgs[0] ?? '').trim();
          const candidateTemplate = getMemeTemplate(templateName);
          texts = parsePrefixTexts(rawArgs.slice(1), candidateTemplate);
        } else {
          // Legacy alias dispatch: `!0days <text1> | <text2>...`
          templateName = ctx.invokedName;
          const candidateTemplate = getMemeTemplate(templateName);
          texts = parsePrefixTexts(rawArgs, candidateTemplate);
        }
      }

      const template = getMemeTemplate(templateName);
      if (!template) {
        const prefix = await resolveContextPrefix(ctx, services);
        await ctx.reply({
          content: buildUnknownTemplateMessage(templateName, prefix),
          ephemeral: true,
        });
        return;
      }

      if (texts.length === 0 || texts.every((t) => t.trim().length === 0)) {
        const prefix = await resolveContextPrefix(ctx, services);
        const example =
          ctx.invokedName === COMMAND_NAME
            ? `${prefix}meme ${template.name} text1 | text2`
            : `${prefix}${ctx.invokedName} text1 | text2`;
        await ctx.reply({
          content: `❌ Please provide text for the meme!\nExample: \`${example}\` or use \`/meme template:${template.name} text1:<text>\``,
          ephemeral: true,
        });
        return;
      }

      try {
        const result = await services.memeSynthesizer.generateMeme(template, texts);

        await ctx.reply({
          content: `🖼️ **${template.title}**`,
          files: [
            {
              attachment: result.buffer,
              name: `${template.id}_meme.png`,
            },
          ],
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await ctx.reply({
          content: `❌ Failed to generate meme: ${message}`,
          ephemeral: true,
        });
      }
    },
  };
}
