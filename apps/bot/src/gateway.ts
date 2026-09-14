import { randomUUID } from 'node:crypto';
import {
  Client, Events, GatewayIntentBits, MessageFlags,
  type Guild,
} from 'discord.js';
import { AppError, type ActorContext, type RuntimeConfig, type SettingsService, createLogger } from '@ririko/core';
import { CommandDispatcher, CommandRegistry, createBuiltinCommands, type HelpResult } from '@ririko/discord';
import { presentResult } from './presentation.js';

interface HelpSession {
  userId: string;
  guildId: string | null;
  channelId: string | null;
  expires: number;
  result: HelpResult;
}

/** Wire Discord events to the shared command dispatcher with bounded help sessions. */
export function createGateway(config: RuntimeConfig, settings: SettingsService): { client: Client; close(): Promise<void> } {
  const logger = createLogger(config.logLevel);
  const registry = new CommandRegistry();
  for (const definition of createBuiltinCommands(settings, registry)) registry.register(definition);
  const dispatcher = new CommandDispatcher({ registry, settings });
  const sessions = new Map<string, HelpSession>();
  const pending = new Set<Promise<void>>();
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], rest: { timeout: 10000, retries: 2 } });

  function track(task: Promise<void>): void {
    pending.add(task);
    void task.then(() => { pending.delete(task); }, () => { pending.delete(task); });
  }

  function helpSession(result: HelpResult, actor: ActorContext): string {
    for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key);
    if (sessions.size >= 1000) {
      const oldest = sessions.keys().next().value;
      if (oldest) sessions.delete(oldest);
    }
    const id = randomUUID();
    sessions.set(id, { userId: actor.userId, guildId: actor.guildId ?? null, channelId: actor.channelId ?? null, expires: Date.now() + 600000, result });
    return id;
  }

  async function actorFor(userId: string, guild: Guild | null, channelId: string | null): Promise<ActorContext> {
    const base = { userId, ...(channelId ? { channelId } : {}), roles: [], permissions: [], botPermissions: [], isOwner: config.discord.ownerIds.includes(userId) };
    if (!guild) return base;
    if (!channelId) throw new AppError('CHANNEL', 'A server channel is required.');
    const [member, bot, channel] = await Promise.all([
      guild.members.fetch({ user: userId, force: true }), guild.members.fetchMe({ force: true }), guild.channels.fetch(channelId, { force: true }),
    ]);
    if (!channel) throw new AppError('CHANNEL', 'The server channel is unavailable.');
    return {
      ...base, guildId: guild.id, channelId,
      roles: [...member.roles.cache.keys()],
      permissions: channel.permissionsFor(member).toArray(),
      botPermissions: channel.permissionsFor(bot).toArray(),
    };
  }

  client.on(Events.MessageCreate, (message) => {
    if (message.author.bot || message.webhookId) return;
    const correlationId = randomUUID();
    track((async () => {
      const prefix = message.guildId ? (await settings.get(message.guildId)).prefix : config.defaultPrefix;
      if (!message.content.startsWith(prefix)) return;
      const actor = await actorFor(message.author.id, message.guild, message.channelId);
      const result = await dispatcher.dispatchPrefix(message.content, actor, Math.max(0, Date.now() - message.createdTimestamp));
      if (!result) return;
      const sessionId = result.kind === 'help' ? helpSession(result, actor) : undefined;
      await message.reply(presentResult(result, sessionId));
      logger.info({ module: 'commands', operation: 'prefix', correlationId, guildId: message.guildId, userId: message.author.id, outcome: result.kind }, 'Command processed');
    })().catch(() => logger.error({ module: 'discord', operation: 'message', correlationId }, 'Message processing failed')));
  });

  client.on(Events.InteractionCreate, (interaction) => {
    const correlationId = randomUUID();
    track((async () => {
      if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const [namespace, sessionId, action] = interaction.customId.split(':');
        if (namespace !== 'help' || !sessionId) return;
        const session = sessions.get(sessionId);
        if (!session || session.expires <= Date.now() || session.userId !== interaction.user.id ||
            session.guildId !== interaction.guildId || session.channelId !== interaction.channelId) {
          await interaction.reply({ content: 'This help menu belongs to another user or has expired. Run /help again.', flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.deferUpdate();
        const actor = await actorFor(interaction.user.id, interaction.guild, interaction.channelId);
        const category = interaction.isStringSelectMenu() ? interaction.values[0] ?? 'all' : session.result.category ?? 'all';
        const page = action === 'next' ? session.result.page + 1 : action === 'previous' ? session.result.page - 1 : 1;
        const result = await dispatcher.dispatch({ actor, transport: 'slash', name: 'help', args: { ...(session.result.search ? { command: session.result.search } : {}), ...(category === 'all' ? {} : { category }), page } });
        if (result.kind === 'help') {
          session.result = result;
          await interaction.editReply(presentResult(result, sessionId));
        } else {
          await interaction.followUp({ content: result.content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
        }
        return;
      }
      if (!interaction.isChatInputCommand() && !interaction.isContextMenuCommand()) return;
      const privateReply = interaction.isContextMenuCommand() || registry.resolve(interaction.commandName)?.defaultEphemeral;
      await interaction.deferReply(privateReply ? { flags: MessageFlags.Ephemeral } : {});
      const actor = await actorFor(interaction.user.id, interaction.guild, interaction.channelId);
      const args: Record<string, string | number | boolean> = {};
      if (interaction.isChatInputCommand()) {
        for (const option of interaction.options.data) {
          if (typeof option.value === 'string' || typeof option.value === 'number' || typeof option.value === 'boolean') args[option.name] = option.value;
        }
      }
      const result = await dispatcher.dispatch({
        actor, transport: interaction.isChatInputCommand() ? 'slash' : 'context', name: interaction.commandName, args,
        ...(interaction.isContextMenuCommand() ? { contextType: interaction.isUserContextMenuCommand() ? 'user' as const : 'message' as const } : {}),
        latencyMs: Math.max(0, Date.now() - interaction.createdTimestamp),
      });
      const sessionId = result.kind === 'help' ? helpSession(result, actor) : undefined;
      await interaction.editReply(presentResult(result, sessionId));
      logger.info({ module: 'commands', operation: 'interaction', command: interaction.commandName, correlationId, guildId: interaction.guildId, userId: interaction.user.id, outcome: result.kind }, 'Command processed');
    })().catch(async () => {
      logger.error({ module: 'discord', operation: 'interaction', correlationId }, 'Interaction processing failed');
      if (interaction.isRepliable()) {
        const content = `The request could not be completed. Reference: ${correlationId}`;
        try {
          if (interaction.deferred || interaction.replied) await interaction.editReply({ content, embeds: [], components: [] });
          else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        } catch { logger.warn({ correlationId }, 'Could not deliver interaction error'); }
      }
    }));
  });
  client.on(Events.Error, () => logger.error({ module: 'discord' }, 'Discord client error'));
  client.on(Events.ShardError, () => logger.error({ module: 'discord' }, 'Discord shard connection error'));
  client.once(Events.ClientReady, () => logger.info({ module: 'discord' }, 'Gateway ready'));
  return {
    client,
    async close() {
      try { await client.destroy(); } finally {
        await Promise.allSettled([...pending]);
        sessions.clear();
      }
    },
  };
}
