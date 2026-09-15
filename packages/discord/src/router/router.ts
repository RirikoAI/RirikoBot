import type { Client, Interaction, Message } from 'discord.js';
import { CommandRegistry } from './registry.js';
import type { CommandRouterOptions } from './types.js';
import { SlashCommandContext, PrefixCommandContext } from '../command/context.js';
import { tokenizeCommandArgs } from '../command/tokenizer.js';
import type { CommandContext } from '../command/types.js';
import { RirikoError } from '@ririko/core';

/**
 * High-performance Dual-Dispatch Command Router.
 * Resolves both Slash Command interactions and Prefix message commands in O(1) time.
 */
export class CommandRouter {
  public readonly registry: CommandRegistry;
  private readonly options: CommandRouterOptions;

  constructor(registry?: CommandRegistry, options: CommandRouterOptions = {}) {
    this.registry = registry ?? new CommandRegistry();
    this.options = {
      defaultPrefix: '!',
      mentionPrefix: true,
      ...options,
    };
  }

  /**
   * Binds interactionCreate and messageCreate gateway listeners to a Discord Client.
   */
  public bindClient(client: Client): void {
    client.on('interactionCreate', async (interaction) => {
      try {
        await this.dispatchInteraction(interaction);
      } catch (error) {
        // Unexpected unhandled dispatch error
        console.error('Unhandled interaction error in CommandRouter:', error);
      }
    });

    client.on('messageCreate', async (message) => {
      try {
        await this.dispatchMessage(message);
      } catch (error) {
        console.error('Unhandled message error in CommandRouter:', error);
      }
    });
  }

  /**
   * Dispatches a Discord interaction (Slash Command or Autocomplete).
   * Returns true if a command handled the interaction, false otherwise.
   */
  public async dispatchInteraction(interaction: Interaction): Promise<boolean> {
    if (interaction.isAutocomplete()) {
      const command = this.registry.get(interaction.commandName);
      if (command && typeof command.autocomplete === 'function') {
        await command.autocomplete(interaction);
        return true;
      }
      return false;
    }

    if (!interaction.isChatInputCommand()) {
      return false;
    }

    const command = this.registry.get(interaction.commandName);
    if (!command) {
      return false;
    }

    if (command.metadata.slashEnabled === false) {
      await interaction.reply({
        content: 'This command is not available via slash commands.',
        ephemeral: true,
      });
      return true;
    }

    const ctx = new SlashCommandContext(interaction);
    try {
      await command.execute(ctx);
      return true;
    } catch (error) {
      await this.handleError(ctx, error);
      return true;
    }
  }

  /**
   * Dispatches a text message as a prefix command.
   * Resolves prefixes dynamically (per guild) or falls back to default.
   * Returns true if a command was dispatched, false otherwise.
   */
  public async dispatchMessage(message: Message): Promise<boolean> {
    if (message.author.bot || message.system) {
      return false;
    }

    const content = message.content.trim();
    if (!content) {
      return false;
    }

    // 1. Check bot mention prefix (e.g. <@123456789> ping)
    let invokedPrefix: string | null = null;
    let commandPayload: string | null = null;

    if (this.options.mentionPrefix && message.client.user) {
      const mentionRegex = new RegExp(`^<@!?${message.client.user.id}>(?:\\s+|$)`);
      const match = content.match(mentionRegex);
      if (match) {
        invokedPrefix = match[0];
        commandPayload = content.slice(match[0].length).trim();
      }
    }

    // 2. Check standard prefix
    if (!invokedPrefix) {
      const configuredPrefix = this.options.resolvePrefix
        ? await this.options.resolvePrefix(message)
        : (this.options.defaultPrefix ?? '!');

      if (content.startsWith(configuredPrefix)) {
        invokedPrefix = configuredPrefix;
        commandPayload = content.slice(configuredPrefix.length).trim();
      }
    }

    if (!invokedPrefix || commandPayload === null || commandPayload.length === 0) {
      return false;
    }

    // 3. Tokenize arguments
    const tokens = tokenizeCommandArgs(commandPayload);
    if (tokens.length === 0) {
      return false;
    }

    const commandName = tokens[0]!;
    const rawArgs = tokens.slice(1);

    // 4. O(1) command lookup
    const command = this.registry.get(commandName);
    if (!command) {
      return false;
    }

    if (command.metadata.prefixEnabled === false) {
      await message.reply(
        `This command is only available as a slash command (\`/${command.metadata.name}\`).`,
      );
      return true;
    }

    const ctx = new PrefixCommandContext(
      message,
      command.metadata.name,
      invokedPrefix,
      rawArgs,
      command.metadata.options,
    );

    try {
      await command.execute(ctx);
      return true;
    } catch (error) {
      await this.handleError(ctx, error);
      return true;
    }
  }

  /**
   * Central error handling formatting user-friendly responses.
   */
  private async handleError(ctx: CommandContext, error: unknown): Promise<void> {
    const err = error instanceof Error ? error : new Error(String(error));

    if (this.options.onError) {
      try {
        await this.options.onError(ctx, err);
      } catch {
        // Suppress hook error to ensure user reply still sends
      }
    }

    const userMessage =
      error instanceof RirikoError
        ? error.userMessage
        : 'An unexpected error occurred while executing this command.';

    const replyContent = `❌ ${userMessage}`;

    try {
      if (ctx.isReplied || ctx.isDeferred) {
        await ctx.followUp({ content: replyContent, ephemeral: true });
      } else {
        await ctx.reply({ content: replyContent, ephemeral: true });
      }
    } catch {
      // Ignored if interaction was already expired or socket closed
    }
  }
}
