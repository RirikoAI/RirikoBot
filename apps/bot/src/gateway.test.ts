import { afterEach, expect, it, vi } from 'vitest';
import { loadConfig, SettingsService, type GuildSettings } from '@ririko/core';
import type * as DiscordModule from 'discord.js';

const clients = vi.hoisted(() => ({ emit: undefined as ((event: string, payload: unknown) => void) | undefined }));
vi.mock('discord.js', async (importOriginal) => {
  const { EventEmitter } = await import('node:events');
  const actual = await importOriginal<typeof DiscordModule>();
  class TestClient extends EventEmitter {
    constructor() { super(); clients.emit = (event, payload) => { this.emit(event, payload); }; }
    async destroy(): Promise<void> { this.removeAllListeners(); }
  }
  return { ...actual, Client: TestClient };
});

import { Events, MessageFlags } from 'discord.js';
import { createGateway } from './gateway.js';

const shutdowns: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(shutdowns.splice(0).map((close) => close())); vi.restoreAllMocks(); });

function setup(settingsOverride?: GuildSettings) {
  const store = { get: vi.fn(() => Promise.resolve(settingsOverride)), save: vi.fn((value: GuildSettings) => Promise.resolve({ ...value, revision: value.revision + 1 })) };
  const gateway = createGateway(loadConfig({ LOG_LEVEL: 'silent' }), new SettingsService(store));
  shutdowns.push(() => gateway.close());
  const member = { id: '2', roles: { cache: new Map<string, string>() } };
  const bot = { id: '3' };
  const channel = { permissionsFor: () => ({ toArray: () => ['ManageGuild', 'SendMessages', 'EmbedLinks'] }) };
  const guild = { id: '1', members: { fetch: vi.fn(() => Promise.resolve(member)), fetchMe: vi.fn(() => Promise.resolve(bot)) }, channels: { fetch: vi.fn(() => Promise.resolve<typeof channel | null>(channel)) } };
  return { store, guild };
}

function slash(guild: ReturnType<typeof setup>['guild'], commandName: string, options: Array<{ name: string; value: string }> = []) {
  const interaction = {
    user: { id: '2' }, guild, guildId: '1', channelId: '4', channel: null,
    commandName, createdTimestamp: Date.now(), options: { data: options }, deferred: false, replied: false,
    isButton: () => false, isStringSelectMenu: () => false, isChatInputCommand: () => true,
    isContextMenuCommand: () => false, isRepliable: () => true,
    deferReply: vi.fn<(options: unknown) => Promise<void>>(async () => { interaction.deferred = true; }),
    editReply: vi.fn<(payload: unknown) => Promise<void>>(async () => {}),
    reply: vi.fn<(payload: unknown) => Promise<void>>(async () => {}),
  };
  return interaction;
}

it('fetches uncached channel permissions and acknowledges private configuration before work', async () => {
  const { store, guild } = setup();
  const interaction = slash(guild, 'prefix', [{ name: 'newprefix', value: '?' }]);
  clients.emit?.(Events.InteractionCreate, interaction);
  await vi.waitFor(() => expect(interaction.editReply).toHaveBeenCalled());
  expect(guild.channels.fetch).toHaveBeenCalledWith('4', { force: true });
  expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ prefix: '?', guildId: '1' }), 0, '2');
  expect(interaction.deferReply.mock.invocationCallOrder[0]).toBeLessThan(guild.members.fetch.mock.invocationCallOrder[0] ?? 0);
});

it('fails closed for channel restrictions and for a missing Discord channel', async () => {
  const { store, guild } = setup({ guildId: '1', prefix: '!', modules: { core: true }, commands: { prefix: { channels: { '4': false } } }, revision: 1 });
  const denied = slash(guild, 'prefix', [{ name: 'newprefix', value: '?' }]);
  clients.emit?.(Events.InteractionCreate, denied);
  await vi.waitFor(() => expect(denied.editReply).toHaveBeenCalled());
  expect(store.save).not.toHaveBeenCalled();
  expect(JSON.stringify(denied.editReply.mock.calls)).toContain('disabled in this channel');
  guild.channels.fetch.mockResolvedValue(null);
  const missing = slash(guild, 'prefix', [{ name: 'newprefix', value: '?' }]);
  clients.emit?.(Events.InteractionCreate, missing);
  await vi.waitFor(() => expect(missing.editReply).toHaveBeenCalled());
  expect(store.save).not.toHaveBeenCalled();
});

it('keeps category menus working without a search and binds them to their requester', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const { guild } = setup();
  const initial = slash(guild, 'help');
  clients.emit?.(Events.InteractionCreate, initial);
  await vi.waitFor(() => expect(initial.editReply).toHaveBeenCalled());
  const match = JSON.stringify(initial.editReply.mock.calls).match(/help:([a-f0-9-]+):category/u);
  if (!match?.[1]) throw new Error('Help menu was not rendered.');
  now.mockReturnValue(2500);
  const component = {
    ...slash(guild, ''), customId: `help:${match[1]}:category`, values: ['all'],
    isButton: () => false, isStringSelectMenu: () => true, isChatInputCommand: () => false,
    deferUpdate: vi.fn(async (): Promise<void> => {}),
    followUp: vi.fn<(payload: unknown) => Promise<void>>(async () => {}),
  };
  clients.emit?.(Events.InteractionCreate, component);
  await vi.waitFor(() => expect(component.editReply).toHaveBeenCalled());
  expect(component.followUp).not.toHaveBeenCalled();
  expect(JSON.stringify(component.editReply.mock.calls)).toContain('Ririko Help');
  const intruder = { ...component, user: { id: '9' }, reply: vi.fn<(payload: unknown) => Promise<void>>(async () => {}) };
  clients.emit?.(Events.InteractionCreate, intruder);
  await vi.waitFor(() => expect(intruder.reply).toHaveBeenCalled());
  expect(intruder.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }));
});
