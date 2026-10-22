import type {
  Client,
  DMChannel,
  GuildBan,
  GuildMember,
  GuildTextBasedChannel,
  Message,
  NonThreadGuildBasedChannel,
  PartialGuildMember,
  PartialMessage,
  ReadonlyCollection,
  Role,
  Snowflake,
  VoiceState,
} from 'discord.js';
import type { BotServices } from '../services.js';

type Services = Pick<BotServices, 'eventLogService'>;
type AnyMessage = Message | PartialMessage;
type AnyChannel = DMChannel | NonThreadGuildBasedChannel;

/**
 * Wraps a gateway handler so an error in one event never reaches the event emitter or stops the
 * others. EventLogService already catches its own errors; this guards the call itself.
 */
function guarded<Args extends unknown[]>(
  event: string,
  handler: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      console.error(`[EventLog] Failed to log ${event}:`, error);
    }
  };
}

/**
 * Forwards gateway events to the EventLogService, which posts them to the channels chosen on
 * the dashboard's Logging page. Each event has its own handler beside the older ones (anti-raid,
 * welcomer, XP and music); direct messages and direct channels are skipped here.
 */
export function registerEventLogListener(client: Client, services: Services): void {
  const log = services.eventLogService;

  client.on(
    'messageUpdate',
    guarded('messageUpdate', async (oldMessage: AnyMessage, newMessage: AnyMessage) => {
      if (!newMessage.guildId) return;
      await log.messageEdited(oldMessage, newMessage);
    }),
  );

  client.on(
    'messageDelete',
    guarded('messageDelete', async (message: AnyMessage) => {
      if (!message.guildId) return;
      await log.messageDeleted(message);
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
        await log.messagesBulkDeleted(messages, channel);
      },
    ),
  );

  client.on(
    'guildMemberAdd',
    guarded('guildMemberAdd', async (member: GuildMember) => {
      await log.memberJoined(member);
    }),
  );

  client.on(
    'guildMemberRemove',
    guarded('guildMemberRemove', async (member: GuildMember | PartialGuildMember) => {
      await log.memberLeft(member);
    }),
  );

  client.on(
    'guildMemberUpdate',
    guarded(
      'guildMemberUpdate',
      async (oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => {
        await log.memberUpdated(oldMember, newMember);
      },
    ),
  );

  client.on(
    'guildBanAdd',
    guarded('guildBanAdd', async (ban: GuildBan) => {
      await log.memberBanned(ban);
    }),
  );

  client.on(
    'guildBanRemove',
    guarded('guildBanRemove', async (ban: GuildBan) => {
      await log.memberUnbanned(ban);
    }),
  );

  client.on(
    'channelCreate',
    guarded('channelCreate', async (channel: NonThreadGuildBasedChannel) => {
      await log.channelCreated(channel);
    }),
  );

  client.on(
    'channelDelete',
    guarded('channelDelete', async (channel: AnyChannel) => {
      if (channel.isDMBased()) return;
      await log.channelDeleted(channel);
    }),
  );

  client.on(
    'channelUpdate',
    guarded('channelUpdate', async (oldChannel: AnyChannel, newChannel: AnyChannel) => {
      if (oldChannel.isDMBased() || newChannel.isDMBased()) return;
      await log.channelUpdated(oldChannel, newChannel);
    }),
  );

  client.on(
    'roleCreate',
    guarded('roleCreate', async (role: Role) => {
      await log.roleCreated(role);
    }),
  );

  client.on(
    'roleDelete',
    guarded('roleDelete', async (role: Role) => {
      await log.roleDeleted(role);
    }),
  );

  client.on(
    'roleUpdate',
    guarded('roleUpdate', async (oldRole: Role, newRole: Role) => {
      await log.roleUpdated(oldRole, newRole);
    }),
  );

  client.on(
    'voiceStateUpdate',
    guarded('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
      await log.voiceStateChanged(oldState, newState);
    }),
  );
}
