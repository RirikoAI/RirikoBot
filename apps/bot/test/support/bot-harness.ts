/**
 * Runs the real bot (services, command router, every registered command and the component
 * interaction handler) over in-memory SQLite, with discord.js REST pointed at the fake Discord
 * API. Gateway events enter through discord.js's own packet handler, so commands see real
 * `Message` and `Interaction` structures and every reply is a real REST request the fake records.
 *
 * Not wired: the gateway connection, voice, and the message listener (automod, XP, card drops,
 * AI chat), so a prefix command produces only the router's replies.
 */
import { createDatabaseClient, type DatabaseClient } from '@ririko/database';
import type { CommandRouter } from '@ririko/discord';
import type { Client } from 'discord.js';
import {
  apiChannel,
  apiMember,
  apiRole,
  apiUser,
  findChannel,
  findGuild,
  findUser,
  gatewayGuildCreate,
  ids,
  memberPermissions,
  startFakeDiscord,
  type FakeDiscordFixture,
  type FakeDiscordServer,
  type RecordedRequest,
  type StoredMessage,
} from '../../../../tests/support/fake-discord/index.js';
import { createCommandRouter, createHelpOptions } from '../../src/command-router.js';
import { createCommandControllers, registerBotCommands } from '../../src/command-set.js';
import { registerComponentInteractions } from '../../src/component-interactions.js';
import { prepareDatabase } from '../../src/database-startup.js';
import { createBot } from '../../src/index.js';
import { createBotServices, type BotServices } from '../../src/services.js';

const DISCORD_EPOCH = 1_420_070_400_000n;
let sequence = 0n;

/** A snowflake for the current time, so discord.js timestamps look like live events. */
export function snowflake(): string {
  sequence = (sequence + 1n) & 0xfffn;
  return (((BigInt(Date.now()) - DISCORD_EPOCH) << 22n) | sequence).toString();
}

/** Application command option types (discord-api-types `ApplicationCommandOptionType`). */
export const OptionType = {
  String: 3,
  Integer: 4,
  Boolean: 5,
  User: 6,
  Channel: 7,
  Role: 8,
} as const;

export interface SlashOption {
  name: string;
  type: number;
  value: string | number | boolean;
}

interface Where {
  /** Defaults to `ids.admin`, the owner of the main guild. */
  userId?: string;
  guildId?: string;
  channelId?: string;
}

export interface InteractionRef {
  id: string;
  token: string;
}

export interface BotHarness {
  fake: FakeDiscordServer;
  client: Client;
  services: BotServices;
  router: CommandRouter;
  db: DatabaseClient;
  /** Feeds one gateway dispatch (e.g. `MESSAGE_CREATE`) through discord.js. */
  dispatch(event: string, data: unknown): void;
  /** A member typing a message; returns the message id. */
  sendMessage(content: string, where?: Where): string;
  runSlashCommand(name: string, options?: SlashOption[], where?: Where): InteractionRef;
  /** Right-click → Apps → `name` on a message with this content, written by `authorId`. */
  runMessageCommand(
    name: string,
    target: { content: string; authorId?: string },
    where?: Where,
  ): InteractionRef;
  /** Clicks a button, or picks select menu `values`, on a message the bot sent. */
  useComponent(
    message: StoredMessage,
    customId: string,
    options?: Where & { values?: string[] },
  ): InteractionRef;
  /** The callback request Discord received for an interaction. */
  interactionCallback(interaction: InteractionRef): Promise<RecordedRequest>;
  /** Waits until every command dispatch the router started has finished. */
  settle(): Promise<void>;
  /** Throws when the bot called a route the fake does not implement. */
  assertAllRoutesHandled(): void;
  close(): Promise<void>;
}

export interface BotHarnessOptions {
  prefix?: string;
  fixture?: FakeDiscordFixture;
}

export async function startBotHarness(options: BotHarnessOptions = {}): Promise<BotHarness> {
  const prefix = options.prefix ?? '!';
  const fake = await startFakeDiscord(options.fixture ? { fixture: options.fixture } : {});
  const db = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
  // The same database step as main(): the migrations are applied before the services start.
  await prepareDatabase(db, {
    autoMigrate: true,
    log: { log: () => undefined, warn: () => undefined },
  });

  const { client } = createBot({ clientOptions: { rest: { api: fake.apiUrl } } });
  client.rest.setToken('fake-bot-token');
  const services = await createBotServices(db, client);

  // The same wiring as main(): router, command set, component interactions.
  const router = createCommandRouter(services, prefix);
  const helpOptions = createHelpOptions(services, prefix);
  const controllers = createCommandControllers(client, services, prefix);
  registerBotCommands(router.registry, {
    services,
    controllers,
    helpOptions,
    prefix,
    version: 'test',
  });

  const inflight = new Set<Promise<unknown>>();
  const track = <T>(promise: Promise<T>): Promise<T> => {
    inflight.add(promise);
    void promise.finally(() => inflight.delete(promise)).catch(() => undefined);
    return promise;
  };
  const dispatchMessage = router.dispatchMessage.bind(router);
  const dispatchInteraction = router.dispatchInteraction.bind(router);
  router.dispatchMessage = (message) => track(dispatchMessage(message));
  router.dispatchInteraction = (interaction) => track(dispatchInteraction(interaction));

  router.bindClient(client);
  registerComponentInteractions(client, {
    services,
    controllers,
    registry: router.registry,
    helpOptions,
  });

  // discord.js internals, used only here: the gateway's packet entry point and its status.
  // A discord.js upgrade that changes them fails harness.test.ts first.
  const ws = client.ws as unknown as {
    status: number;
    handlePacket(packet: { t: string; d: unknown }, shard: unknown): boolean;
  };
  const shard = { id: 0, checkReady: () => undefined };
  const READY_STATUS = 0;
  ws.status = READY_STATUS;

  const dispatch = (event: string, data: unknown) => {
    if (!ws.handlePacket({ t: event, d: data }, shard)) {
      throw new Error(`discord.js queued ${event} instead of handling it`);
    }
  };

  const fixture = () => fake.fixture;
  const resolveWhere = (where: Where = {}) => {
    const userId = where.userId ?? ids.admin;
    const guildId = where.guildId ?? ids.mainGuild;
    const channelId = where.channelId ?? ids.generalChannel;
    const guild = findGuild(fixture(), guildId);
    const user = findUser(fixture(), userId);
    const member = guild?.members.find((m) => m.userId === userId);
    const channel = findChannel(fixture(), channelId)?.channel;
    if (!guild || !user || !member || !channel) {
      throw new Error(`No member ${userId} in guild ${guildId} with channel ${channelId}`);
    }
    return { userId, guildId, channelId, guild, user, member, channel };
  };

  const interactionBase = (where?: Where) => {
    const { guild, member, channel, guildId, channelId, userId } = resolveWhere(where);
    const id = snowflake();
    return {
      id,
      token: `token-${id}`,
      application_id: fixture().applicationId,
      version: 1,
      guild_id: guildId,
      channel_id: channelId,
      channel: apiChannel(channel, guildId),
      guild: { id: guildId, locale: 'en-US', features: [] },
      member: {
        ...apiMember(fixture(), member),
        permissions: memberPermissions(guild, userId).toString(),
      },
      locale: 'en-US',
      guild_locale: 'en-US',
      app_permissions: memberPermissions(guild, fixture().bot.id).toString(),
      entitlements: [],
      authorizing_integration_owners: { '0': guildId },
      context: 0,
      attachment_size_limit: 10_485_760,
    };
  };

  const messagePayload = (content: string, where?: Where) => {
    const { user, member, guildId, channelId } = resolveWhere(where);
    const mentioned = [...content.matchAll(/<@!?(\d+)>/g)]
      .map((m) => findUser(fixture(), m[1] ?? ''))
      .filter((u) => u !== undefined)
      .map(apiUser);
    const { user: _user, ...memberData } = apiMember(fixture(), member);
    return {
      id: snowflake(),
      type: 0,
      channel_id: channelId,
      guild_id: guildId,
      author: apiUser(user),
      member: memberData,
      content,
      timestamp: new Date().toISOString(),
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: mentioned,
      mention_roles: [],
      attachments: [],
      embeds: [],
      components: [],
      pinned: false,
      flags: 0,
    };
  };

  const harness: BotHarness = {
    fake,
    client,
    services,
    router,
    db,
    dispatch,

    sendMessage(content, where) {
      const message = messagePayload(content, where);
      dispatch('MESSAGE_CREATE', message);
      return message.id;
    },

    runSlashCommand(name, options = [], where) {
      const base = interactionBase(where);
      const resolved = resolveOptions(options);
      dispatch('INTERACTION_CREATE', {
        ...base,
        type: 2,
        data: {
          id: snowflake(),
          name,
          type: 1,
          guild_id: base.guild_id,
          options,
          ...(resolved ? { resolved } : {}),
        },
      });
      return { id: base.id, token: base.token };
    },

    runMessageCommand(name, target, where) {
      const base = interactionBase(where);
      const message = messagePayload(target.content, {
        userId: target.authorId ?? ids.member,
        guildId: base.guild_id,
        channelId: base.channel_id,
      });
      dispatch('INTERACTION_CREATE', {
        ...base,
        type: 2,
        data: {
          id: snowflake(),
          name,
          type: 3,
          guild_id: base.guild_id,
          target_id: message.id,
          resolved: { messages: { [message.id]: message } },
        },
      });
      return { id: base.id, token: base.token };
    },

    useComponent(message, customId, componentOptions = {}) {
      const base = interactionBase(componentOptions);
      const values = componentOptions.values;
      dispatch('INTERACTION_CREATE', {
        ...base,
        type: 3,
        // Interaction replies are stored without a channel; place them where the click happens.
        message: { ...message, channel_id: base.channel_id, guild_id: base.guild_id },
        data: {
          custom_id: customId,
          component_type: values ? 3 : 2,
          ...(values ? { values } : {}),
        },
      });
      return { id: base.id, token: base.token };
    },

    interactionCallback(interaction) {
      return fake.waitFor('POST', `/interactions/${interaction.id}/${interaction.token}/callback`);
    },

    async settle() {
      while (inflight.size > 0) await Promise.allSettled([...inflight]);
    },

    assertAllRoutesHandled() {
      if (fake.unhandled.length === 0) return;
      const routes = fake.unhandled.map((r) => `${r.method} ${r.path}`).join(', ');
      throw new Error(`The bot called routes the fake Discord API does not implement: ${routes}`);
    },

    async close() {
      await harness.settle();
      await client.destroy();
      await db.close();
      await fake.close();
    },
  };

  function resolveOptions(options: SlashOption[]) {
    const users: Record<string, unknown> = {};
    const members: Record<string, unknown> = {};
    const channels: Record<string, unknown> = {};
    const roles: Record<string, unknown> = {};
    for (const option of options) {
      const id = String(option.value);
      if (option.type === OptionType.User) {
        const user = findUser(fixture(), id);
        if (user) users[id] = apiUser(user);
        const member = findGuild(fixture(), ids.mainGuild)?.members.find((m) => m.userId === id);
        if (member) {
          const { user: _user, ...memberData } = apiMember(fixture(), member);
          members[id] = memberData;
        }
      }
      if (option.type === OptionType.Channel) {
        const found = findChannel(fixture(), id);
        if (found)
          channels[id] = { ...apiChannel(found.channel, found.guild.id), permissions: '0' };
      }
      if (option.type === OptionType.Role) {
        const role = fixture()
          .guilds.flatMap((g) => g.roles)
          .find((r) => r.id === id);
        if (role) roles[id] = apiRole(role);
      }
    }
    const resolved = { users, members, channels, roles };
    return Object.values(resolved).some((map) => Object.keys(map).length > 0) ? resolved : null;
  }

  // Connect: READY with every guild unavailable, then GUILD_CREATE for each, as Discord does.
  dispatch('READY', {
    v: 10,
    user: apiUser(fixture().bot),
    guilds: fixture().guilds.map((g) => ({ id: g.id, unavailable: true })),
    session_id: 'fake-session',
    resume_gateway_url: 'ws://127.0.0.1',
    application: { id: fixture().applicationId, flags: 0 },
  });
  for (const guild of fixture().guilds)
    dispatch('GUILD_CREATE', gatewayGuildCreate(fixture(), guild));

  return harness;
}
