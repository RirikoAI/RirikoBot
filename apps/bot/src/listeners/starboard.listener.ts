import type {
  Client,
  GuildTextBasedChannel,
  Message,
  MessageReaction,
  PartialMessage,
  PartialMessageReaction,
  PartialUser,
  ReadonlyCollection,
  Snowflake,
  User,
} from 'discord.js';
import type { BotServices } from '../services.js';

type Services = Pick<BotServices, 'starboardService'>;
type AnyMessage = Message | PartialMessage;
type AnyReaction = MessageReaction | PartialMessageReaction;

/**
 * Wraps a gateway handler so an error in one event never reaches the event emitter or stops the
 * others. StarboardService already catches its own errors; this guards the fetch and the call.
 */
function guarded<Args extends unknown[]>(
  event: string,
  handler: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      console.error(`[Starboard] Failed to handle ${event}:`, error);
    }
  };
}

/**
 * Forwards star and delete events to the StarboardService, which counts the stars and posts,
 * edits or removes the copy in the starboard channel chosen on the dashboard. The reaction
 * events share one call: the service reads the current reaction from the fetched message, so
 * adding, removing and clearing stars all arrive at `reactionChanged`. Direct messages are
 * skipped, and a message that cannot be fetched (deleted, or no access) is dropped.
 */
export function registerStarboardListener(client: Client, services: Services): void {
  const starboard = services.starboardService;

  /** Resolves a partial message, then hands it to the service. */
  const reactionChanged = async (message: AnyMessage): Promise<void> => {
    if (!message.guildId) return;
    const full = message.partial ? await message.fetch().catch(() => null) : message;
    if (!full?.guildId) return;
    await starboard.reactionChanged(full);
  };

  const onReaction = (event: string) =>
    guarded(event, async (reaction: AnyReaction, _user: User | PartialUser) => {
      await reactionChanged(reaction.message);
    });

  client.on('messageReactionAdd', onReaction('messageReactionAdd'));
  client.on('messageReactionRemove', onReaction('messageReactionRemove'));

  client.on(
    'messageReactionRemoveAll',
    guarded(
      'messageReactionRemoveAll',
      async (message: AnyMessage, _reactions: ReadonlyCollection<Snowflake, MessageReaction>) => {
        await reactionChanged(message);
      },
    ),
  );

  client.on(
    'messageReactionRemoveEmoji',
    guarded('messageReactionRemoveEmoji', async (reaction: AnyReaction) => {
      await reactionChanged(reaction.message);
    }),
  );

  client.on(
    'messageDelete',
    guarded('messageDelete', async (message: AnyMessage) => {
      if (!message.guildId) return;
      await starboard.messageDeleted(message.guildId, message.id);
    }),
  );

  client.on(
    'messageDeleteBulk',
    guarded(
      'messageDeleteBulk',
      async (
        messages: ReadonlyCollection<Snowflake, AnyMessage>,
        channel: GuildTextBasedChannel,
      ) => {
        if (channel.isDMBased()) return;
        for (const messageId of messages.keys()) {
          // Each call has its own guard, so one failure does not stop the rest.
          await starboard.messageDeleted(channel.guildId, messageId);
        }
      },
    ),
  );
}
