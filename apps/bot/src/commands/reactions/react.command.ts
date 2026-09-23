import { EmbedBuilder, type AutocompleteInteraction, type User } from 'discord.js';
import { CommandCategory, type Command, type CommandContext } from '@ririko/discord';
import { REACTION_NAMES, getReaction, searchReactions } from '@ririko/services';
import type { BotServices } from '../../services.js';
import { resolveContextPrefix } from '../shared/prefix-resolver.js';

/** Canonical command name/invocation, e.g. `/react type:hug` or `!react hug`. */
const COMMAND_NAME = 'react';

/**
 * Legacy prefix aliases: every catalog reaction name doubles as a `!<name>` shortcut (e.g.
 * `!hug @user`), exactly as it did in 1.4.0's one-command-per-reaction layout.
 *
 * `roll` is excluded: `apps/bot/src/commands/games/dice.command.ts` already registers `roll` as
 * an alias of `/dice` (`!roll 2`), and `CommandRegistry.register` throws on any alias collision,
 * which would prevent the bot from booting. The `roll` reaction (react-roll-around-playfully)
 * stays reachable via `/react type:roll` and `!react roll` — it is simply not a bare `!roll`
 * shortcut. See TASK-1302's summary for this collision.
 */
const ALIAS_COLLISIONS = new Set(['roll']);
const REACT_ALIASES = REACTION_NAMES.filter((name) => !ALIAS_COLLISIONS.has(name));

const MAX_AUTOCOMPLETE_NAME_LENGTH = 100;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Resolves a mentioned user from a raw prefix-command token (`<@123>`, `<@!123>`, or a bare
 * snowflake), mirroring the lookup `PrefixOptionsResolver.getUser` does for a USER option slot.
 * This command cannot rely on that resolver's positional-index lookup for alias dispatch (e.g.
 * `!hug @user` has no `type` argument occupying the slot before `target`), so it resolves the
 * mention directly from the raw args instead.
 */
async function resolveMentionedUser(ctx: CommandContext, raw: string | undefined): Promise<User | null> {
  if (!raw) return null;
  const match = raw.match(/^(?:<@!?)?(\d{17,20})>?$/);
  if (!match) return null;
  const userId = match[1]!;
  try {
    return ctx.client.users.cache.get(userId) ?? (await ctx.client.users.fetch(userId));
  } catch {
    return null;
  }
}



function buildUnknownReactionMessage(attempted: string, prefix: string): string {
  const suggestions = attempted ? searchReactions(attempted, 5).map((r) => r.name) : [];
  const lines = [
    attempted
      ? `❌ \`${attempted}\` is not a known reaction.`
      : '❌ Please tell me which reaction to send.',
  ];
  if (suggestions.length > 0) {
    lines.push(`Did you mean: ${suggestions.map((s) => `\`${s}\``).join(', ')}?`);
  }
  lines.push(
    `Use \`/react type:\` and pick from the autocomplete list (${REACTION_NAMES.length} reactions), ` +
      `or \`${prefix}react <name>\`, e.g. \`${prefix}react hug\`. Legacy shortcuts like \`${prefix}hug @user\` still work too.`,
  );
  return lines.join('\n');
}

/**
 * Creates the unified dual-dispatch `/react` command (STORY-130 / TASK-1302), with every legacy
 * 1.4.0 reaction command name (minus the one `roll` collision, see `ALIAS_COLLISIONS`) wired up
 * as a prefix alias so `!hug @user`, `!poke`, etc. keep working exactly as they did in 1.4.0.
 */
export function createReactCommand(services: BotServices): Command {
  return {
    metadata: {
      name: COMMAND_NAME,
      category: CommandCategory.REACTIONS,
      description: 'Send an anime-style reaction GIF to someone (or to yourself), e.g. hug, poke, slap',
      aliases: REACT_ALIASES,
      usage: '/react type:<reaction> [target:@user] | !react <reaction> [@user] | !hug @user',
      examples: ['/react type:hug target:@user', '!react hug @user', '!hug @user', '!poke'],
      cooldownSeconds: 2,
      options: [
        {
          name: 'type',
          description: 'Which reaction to send (e.g. hug, poke, slap)',
          type: 'STRING',
          required: true,
          autocomplete: true,
        },
        {
          name: 'target',
          description: 'The user to react to (defaults to yourself when omitted)',
          type: 'USER',
          required: false,
        },
      ],
    },

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
      const focused = interaction.options.getFocused();
      const matches = searchReactions(focused);
      await interaction.respond(
        matches.map((reaction) => ({
          name: truncate(`${reaction.name} — ${reaction.description}`, MAX_AUTOCOMPLETE_NAME_LENGTH),
          value: reaction.name,
        })),
      );
    },

    async execute(ctx: CommandContext): Promise<void> {
      let reactionName: string;
      let targetUser: User | null;

      if (ctx.source === 'slash') {
        reactionName = (ctx.options.getString('type', true) ?? '').trim();
        targetUser = await ctx.options.getUser('target');
      } else {
        const rawArgs = ctx.options.getRawArgs();
        if (ctx.invokedName === COMMAND_NAME) {
          // Canonical dispatch: `!react <type> [@target]`.
          reactionName = (rawArgs[0] ?? '').trim();
          targetUser = await resolveMentionedUser(ctx, rawArgs[1]);
        } else {
          // Legacy alias dispatch: the invoked name IS the reaction, e.g. `!hug [@target]`.
          reactionName = ctx.invokedName;
          targetUser = await resolveMentionedUser(ctx, rawArgs[0]);
        }
      }

      const reaction = getReaction(reactionName);
      if (!reaction) {
        const prefix = await resolveContextPrefix(ctx, services);
        await ctx.reply({ content: buildUnknownReactionMessage(reactionName, prefix), ephemeral: true });
        return;
      }

      const hasDistinctTarget = targetUser !== null && targetUser.id !== ctx.user.id;
      const content = hasDistinctTarget
        ? `<@${ctx.user.id}> ${reaction.content} <@${targetUser!.id}>`
        : `<@${ctx.user.id}> ${reaction.noTargetContent}`;

      const embed = new EmbedBuilder().setFooter({
        text: `Requested by ${ctx.user.username}`,
        iconURL: ctx.user.displayAvatarURL(),
      });

      const result = await services.reactionGifService.getGifUrl(reaction.name);
      if (result) {
        embed.setImage(result.url);
      } else {
        embed.setDescription("Error fetching the image.\nYou'll have to use your imagination for this one!");
      }

      await ctx.reply({ content, embeds: [embed] });
    },
  };
}
