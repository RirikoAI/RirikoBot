import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import {
  DEFAULT_CARD_TEXT_COLOR,
  DEFAULT_FAREWELL_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
  HexColorSetting,
  OptionalImageUrlSetting,
  SecurityError,
  WelcomerMessageSetting,
  type WelcomerCardKind,
} from '@ririko/core';
import type { WelcomeConfig } from '@ririko/database';
import {
  CommandGuildOnlyError,
  CommandPermissionError,
  type CommandContext,
} from '@ririko/discord';
import { assertPublicUrl } from '@ririko/services/net';
import type { BotServices } from '../../services.js';

const COPY: Record<
  WelcomerCardKind,
  { command: string; noun: string; title: string; defaultMessage: string; channelExample: string }
> = {
  welcome: {
    command: 'welcomer',
    noun: 'Welcomer',
    title: '👋 Server Welcomer Configuration',
    defaultMessage: DEFAULT_WELCOME_MESSAGE,
    channelExample: '#welcome',
  },
  farewell: {
    command: 'farewell',
    noun: 'Farewell',
    title: '👋 Server Farewell Configuration',
    defaultMessage: DEFAULT_FAREWELL_MESSAGE,
    channelExample: '#goodbye',
  },
};

interface CardChanges {
  channelId?: string | undefined;
  messageTemplate?: string | undefined;
  backgroundUrl?: string | undefined;
  textColor?: string | undefined;
  enable?: boolean | undefined;
}

/** Reads the changes from slash options, or from `!<command> <field> <value>`. */
async function readChanges(ctx: CommandContext): Promise<CardChanges> {
  if (ctx.source === 'prefix') {
    const rawArgs = ctx.options.getRawArgs();
    if (rawArgs.length === 0) return {};
    const action = rawArgs[0]!.toLowerCase();
    const value = rawArgs.slice(1).join(' ');
    if (action === 'channel') return { channelId: value.replace(/<#|>/g, '').trim() };
    if (action === 'message') return { messageTemplate: value };
    if (action === 'background') return { backgroundUrl: value };
    if (action === 'color') return { textColor: value };
    if (action === 'enable') {
      return { enable: ['true', 'on', 'yes', '1', ''].includes(value.toLowerCase()) };
    }
    if (action === 'disable') return { enable: false };
    return {};
  }
  const enable = ctx.options.getBoolean('enable');
  return {
    channelId: (await ctx.options.getChannel('channel'))?.id,
    messageTemplate: ctx.options.getString('message') ?? undefined,
    backgroundUrl: ctx.options.getString('background') ?? undefined,
    textColor: ctx.options.getString('color') ?? undefined,
    enable: enable ?? undefined,
  };
}

/** The first problem with the changes, for the user, or null when they can be saved. */
async function problemWith(ctx: CommandContext, changes: CardChanges): Promise<string | null> {
  if (changes.channelId !== undefined) {
    const channel =
      ctx.guild!.channels.cache.get(changes.channelId) ??
      (await ctx.guild!.channels.fetch(changes.channelId).catch(() => null));
    if (!channel || !channel.isTextBased()) return '❌ Choose a text channel of this server.';
  }
  if (
    changes.messageTemplate !== undefined &&
    !WelcomerMessageSetting.safeParse(changes.messageTemplate).success
  ) {
    return '❌ The message must be 1 to 200 characters.';
  }
  if (changes.textColor !== undefined && !HexColorSetting.safeParse(changes.textColor).success) {
    return '❌ Use a color like `#ffffff`.';
  }
  if (changes.backgroundUrl !== undefined) {
    const parsed = OptionalImageUrlSetting.safeParse(changes.backgroundUrl);
    if (!parsed.success) return '❌ Use an http or https link to an image, or `none`.';
    if (parsed.data) {
      try {
        await assertPublicUrl(parsed.data);
      } catch (error) {
        if (!(error instanceof SecurityError)) throw error;
        return '❌ The background link must point to a public image; local and private addresses are not allowed.';
      }
    }
  }
  return null;
}

/**
 * `/welcomer` and `/farewell`: shows the card settings, or saves the given changes. The same
 * checks as the dashboard apply (a text channel of this server, a `#rrggbb` color, a public
 * http or https background). A new link replaces an uploaded background.
 */
export async function runWelcomerCardCommand(
  ctx: CommandContext,
  services: BotServices,
  kind: WelcomerCardKind,
): Promise<void> {
  const copy = COPY[kind];
  if (!ctx.guild) {
    throw new CommandGuildOnlyError(`The ${copy.command} settings can only be used in a server.`);
  }
  if (!ctx.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    throw new CommandPermissionError(
      `You need the **Manage Server** permission to configure the ${copy.noun.toLowerCase()}.`,
      { missingPermissions: ['ManageGuild'], missingFor: 'user' },
    );
  }

  const guildId = ctx.guild.id;
  const load = () =>
    kind === 'welcome'
      ? services.welcomerRepo.getWelcomeConfig(guildId)
      : services.welcomerRepo.getFarewellConfig(guildId);
  let config = await load();
  const changes = await readChanges(ctx);
  const updating = Object.values(changes).some((value) => value !== undefined);
  let notice: string | null = null;

  if (updating) {
    const problem = await problemWith(ctx, changes);
    if (problem) {
      await ctx.reply(problem);
      return;
    }

    const backgroundUrl =
      changes.backgroundUrl === undefined
        ? (config?.backgroundUrl ?? null)
        : OptionalImageUrlSetting.parse(changes.backgroundUrl);
    const data: WelcomeConfig = {
      guildId,
      channelId: changes.channelId ?? config?.channelId ?? '',
      messageTemplate:
        changes.messageTemplate !== undefined
          ? WelcomerMessageSetting.parse(changes.messageTemplate)
          : (config?.messageTemplate ?? copy.defaultMessage),
      cardTheme: config?.cardTheme ?? 'DEFAULT',
      backgroundUrl,
      // A link given now replaces an upload; `none` clears both.
      backgroundFile: changes.backgroundUrl === undefined ? (config?.backgroundFile ?? null) : null,
      textColor:
        changes.textColor !== undefined
          ? HexColorSetting.parse(changes.textColor)
          : (config?.textColor ?? DEFAULT_CARD_TEXT_COLOR),
      isEnabled: changes.enable ?? config?.isEnabled ?? true,
    };

    if (!data.channelId && data.isEnabled) {
      await ctx.reply(
        `❌ Set a channel before turning the ${copy.noun.toLowerCase()} on. Example: \`/${copy.command} channel:${copy.channelExample}\``,
      );
      return;
    }

    config =
      kind === 'welcome'
        ? await services.welcomerRepo.setWelcomeConfig(data)
        : await services.welcomerRepo.setFarewellConfig(data);
    if (changes.backgroundUrl !== undefined) {
      await services.welcomerService.backgrounds
        .prune(guildId, kind, null)
        .catch((error: unknown) =>
          console.error(`[Welcomer] Could not delete old backgrounds for ${guildId}:`, error),
        );
    }
    notice = `✅ ${copy.noun} settings updated.`;
  }

  if (!config) {
    await ctx.reply(
      `ℹ️ The ${copy.noun.toLowerCase()} is not set up on this server. Use \`/${copy.command} channel:${copy.channelExample}\` to set it up.`,
    );
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(config.isEnabled ? 0x57f287 : 0xed4245)
    .setTitle(copy.title)
    .addFields([
      { name: 'Status', value: config.isEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      {
        name: 'Channel',
        value: config.channelId ? `<#${config.channelId}>` : 'Not set',
        inline: true,
      },
      { name: 'Text Color', value: `\`${config.textColor}\``, inline: true },
      { name: 'Message Template', value: `\`${config.messageTemplate}\``, inline: false },
      {
        name: 'Background',
        value: config.backgroundFile
          ? 'Uploaded on the dashboard'
          : config.backgroundUrl
            ? `[Link](${config.backgroundUrl})`
            : 'Default',
        inline: false,
      },
    ])
    .setFooter({ text: 'Ririko AI 2.0 • Server Utilities' });

  await ctx.reply(notice ? { content: notice, embeds: [embed] } : { embeds: [embed] });
}
