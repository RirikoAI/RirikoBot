import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GatewayIntentBits,
  Partials,
  Client,
  IntentsBitField,
  type ClientOptions,
  type CloseEvent,
} from 'discord.js';
import { createDiscordClient, DEFAULT_GATEWAY_INTENTS, DEFAULT_PARTIALS } from './factory.js';
import { GatewayManager } from './gateway.js';
import { createRestClient } from '../rest/client.js';
import { DiscordError, GatewayError } from '../errors/index.js';

describe('Discord Client Factory (TASK-0301)', () => {
  it('instantiates a Discord.js 14 Client with default production intents and partials', () => {
    const client = createDiscordClient();

    expect(client).toBeInstanceOf(Client);

    const options = client.options as ClientOptions;
    // Check intents bitfield contains default intents
    const intentsBitField = new IntentsBitField(options.intents);
    for (const intent of DEFAULT_GATEWAY_INTENTS) {
      expect(intentsBitField.has(intent)).toBe(true);
    }

    // Check partials
    expect(options.partials).toEqual(DEFAULT_PARTIALS);
    expect(options.partials).toContain(Partials.Message);
    expect(options.partials).toContain(Partials.Channel);
    expect(options.partials).toContain(Partials.Reaction);
    expect(options.partials).toContain(Partials.User);
    expect(options.partials).toContain(Partials.GuildMember);
  });

  it('configures memory sweepers for messages and threads', () => {
    const client = createDiscordClient();
    const options = client.options as ClientOptions;

    expect(options.sweepers).toBeDefined();
    expect(options.sweepers?.messages).toEqual({
      interval: 1800,
      lifetime: 3600,
    });
    expect(options.sweepers?.threads).toEqual({
      interval: 1800,
      lifetime: 3600,
    });
  });

  it('supports custom intent and presence overrides', () => {
    const customIntents = [GatewayIntentBits.Guilds];
    const client = createDiscordClient({
      intents: customIntents,
      presence: {
        status: 'dnd',
      },
    });

    const options = client.options as ClientOptions;
    const bitfield = new IntentsBitField(options.intents);
    expect(bitfield.has(GatewayIntentBits.Guilds)).toBe(true);
    expect(options.presence?.status).toBe('dnd');
  });

  it('creates REST API v10 client correctly', () => {
    const rest = createRestClient('dummy_token_test');
    expect(rest).toBeDefined();
    expect(rest.options.version).toBe('10');
    expect(rest.options.authPrefix).toBe('Bot');
  });
});

describe('Gateway Lifecycle State Machine & Monitoring (TASK-0302)', () => {
  let client: Client;
  let manager: GatewayManager;

  beforeEach(() => {
    client = createDiscordClient();
    manager = new GatewayManager(client, {
      autoReconnect: true,
      maxReconnectAttempts: 3,
      initialBackoffMs: 10,
      maxBackoffMs: 50,
    });
  });

  it('starts in DISCONNECTED state', () => {
    expect(manager.state).toBe('DISCONNECTED');
  });

  it('transitions state and emits stateChange events', async () => {
    const states: string[] = [];
    manager.on('stateChange', (event) => {
      states.push(`${event.from} -> ${event.to}`);
    });

    // Mock client.login
    vi.spyOn(client, 'login').mockImplementation(async () => {
      client.emit('ready', client as unknown as Client<true>);
      return 'token';
    });

    await manager.connect('test_token');

    expect(manager.state).toBe('READY');
    expect(states).toContain('DISCONNECTED -> CONNECTING');
    expect(states).toContain('CONNECTING -> READY');
  });

  it('handles shard disconnection and enters RECONNECTING state', () => {
    const states: string[] = [];
    manager.on('stateChange', (event) => {
      states.push(event.to);
    });

    const mockCloseEvent = { code: 1000, reason: '', wasClean: true } as unknown as CloseEvent;
    client.emit('shardDisconnect', mockCloseEvent, 0);

    expect(manager.state).toBe('RECONNECTING');
    expect(states).toContain('RECONNECTING');
  });

  it('resumes to READY on shardResume', () => {
    const mockCloseEvent = { code: 1000, reason: '', wasClean: true } as unknown as CloseEvent;
    client.emit('shardDisconnect', mockCloseEvent, 0);
    expect(manager.state).toBe('RECONNECTING');

    client.emit('shardResume', 0, 5);
    expect(manager.state).toBe('READY');
  });

  it('emits GatewayError on shardError', () => {
    let capturedError: unknown;
    manager.on('error', (err) => {
      capturedError = err;
    });

    client.emit('shardError', new Error('Websocket timeout'), 0);

    expect(capturedError).toBeInstanceOf(GatewayError);
    expect((capturedError as GatewayError).message).toContain('Websocket timeout');
  });

  it('reports comprehensive runtime telemetry in getMetrics()', () => {
    const metrics = manager.getMetrics();

    expect(metrics).toMatchObject({
      state: 'DISCONNECTED',
      ping: -1,
      uptime: null,
      guildCount: 0,
      userCount: 0,
      shardCount: 0,
      shards: [],
    });
  });

  it('gracefully shuts down client on destroy()', async () => {
    const destroySpy = vi.spyOn(client, 'destroy').mockResolvedValue(undefined);

    await manager.destroy();

    expect(manager.state).toBe('DESTROYED');
    expect(destroySpy).toHaveBeenCalledOnce();
  });
});

describe('Discord Error Hierarchy', () => {
  it('instantiates DiscordError and GatewayError with correct codes and status codes', () => {
    const discordErr = new DiscordError('Test Discord Error');
    expect(discordErr.code).toBe('INTERNAL_ERROR');
    expect(discordErr.statusCode).toBe(500);

    const gatewayErr = new GatewayError('Connection timed out');
    expect(gatewayErr.code).toBe('NETWORK_TIMEOUT');
    expect(gatewayErr.statusCode).toBe(503);
  });
});
