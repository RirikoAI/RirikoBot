import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from '@ririko/core';
import type { ActorContext, GuildSettings } from '@ririko/core';
import { CommandDispatcher, CommandRegistry, createBuiltinCommands, parseArguments, parsePrefix, tokenize } from './index.js';
import type { CommandDefinition, CommandOption, CommandResult } from './index.js';

const actor: ActorContext = {
  userId: '100', guildId: '200', channelId: '300', roles: ['400'],
  permissions: ['ManageGuild'], botPermissions: ['SendMessages'], isOwner: false,
};

function fixture(initial?: GuildSettings) {
  let stored = initial;
  let now = 1000;
  const save = vi.fn((value: GuildSettings, revision: number, actorId: string) => {
    expect(revision).toBe(stored?.revision ?? 0);
    expect(actorId).toBe(actor.userId);
    stored = structuredClone({ ...value, revision: revision + 1 });
    return Promise.resolve(stored);
  });
  const settings = new SettingsService({ get: () => Promise.resolve(stored), save }, '!', undefined, () => now);
  const registry = new CommandRegistry();
  const dispatcher = new CommandDispatcher({ registry, settings, clock: () => now });
  return { settings, registry, dispatcher, save, advance: () => { now += 2000; } };
}

function command(overrides: Partial<CommandDefinition> = {}): CommandDefinition {
  return {
    name: 'echo', description: 'Echo a supplied value.', category: 'general', module: 'core',
    options: [{ name: 'text', description: 'Text to echo.', type: 'string', required: true }],
    examples: { slash: ['/echo text:hello'], prefix: ['!echo hello'] },
    execute: (context) => Promise.resolve({ kind: 'text', content: String(context.args.text) }), ...overrides,
  };
}

function errorCode(result: CommandResult | null): string | undefined {
  return result?.kind === 'error' ? result.code : undefined;
}

describe('prefix parser', () => {
  it('matches custom prefixes literally and supports quotes, escapes and empty quoted tokens', () => {
    expect(parsePrefix('$!echo "hello world" a\\ b \'\' \\"', '$!')).toEqual(['echo', 'hello world', 'a b', '', '"']);
    expect(parsePrefix('hello $!echo', '$!')).toBeNull();
    expect(parsePrefix('$!  ', '$!')).toBeNull();
  });

  it('rejects incomplete quoting and bounded input violations', () => {
    expect(() => tokenize('echo "unfinished')).toThrow('Close quoted text');
    expect(() => tokenize('echo trailing\\')).toThrow('Close quoted text');
    expect(() => tokenize('x'.repeat(4001))).toThrow('too long');
    expect(() => tokenize(Array(101).fill('x').join(' '))).toThrow('Too many');
  });

  it('supports named, positional, inline and literal options without shell expansion', () => {
    const options: readonly CommandOption[] = [
      { name: 'text', description: 'Text.', type: 'string', required: true },
      { name: 'count', description: 'Count.', type: 'integer', min: 1, max: 5 },
      { name: 'enabled', description: 'Toggle.', type: 'boolean' },
    ];
    expect(parseArguments(['--count=2', '--enabled', '--', '$(not-executed)'], options)).toEqual({ text: '$(not-executed)', count: 2, enabled: true });
    expect(() => parseArguments(['--count', '2oops', 'hello'], options)).toThrow('whole number');
    expect(() => parseArguments(['--count', '2', '--count', '3', 'hello'], options)).toThrow('supplied twice');
    expect(() => parseArguments(['--unknown', 'test'], options)).toThrow('Unknown option');
    expect(() => parseArguments(['--count', '0', 'hello'], options)).toThrow('range');
  });
});

describe('registry and invocation', () => {
  it('validates all aliases before registration and snapshots metadata', () => {
    const registry = new CommandRegistry([command({ aliases: ['say'] })]);
    expect(() => registry.register(command({ name: 'second', aliases: ['extra', 'say'] }))).toThrow('already registered');
    expect(registry.resolve('extra')).toBeUndefined();
    const definition = command({ name: 'third', aliases: ['three'] });
    registry.register(definition);
    definition.name = 'mutated';
    expect(registry.resolve('THREE')?.name).toBe('third');
    expect(registry.resolve('mutated')).toBeUndefined();
  });

  it('sends slash and escaped prefix arguments to the same handler and supports spaced legacy aliases', async () => {
    const { registry, dispatcher } = fixture();
    registry.register(command({ aliases: ['say', 'echo text'] }));
    const prefix = await dispatcher.dispatchPrefix('!ECHO TEXT "hello world"', actor);
    const slash = await dispatcher.dispatch({ name: 'echo', transport: 'slash', actor, args: { text: 'hello world' } });
    expect(prefix).toEqual(slash);
    expect(prefix).toEqual({ kind: 'text', content: 'hello world' });
    expect(errorCode(await dispatcher.dispatchPrefix('!say', actor))).toBe('VALIDATION');
    expect(await dispatcher.dispatchPrefix('normal message', actor)).toBeNull();
  });

  it('awaits asynchronous failures, hides unexpected exception details, and keeps requests isolated', async () => {
    const { registry, dispatcher } = fixture();
    registry.register(command({ async execute(context) { await Promise.resolve(); return { kind: 'text', content: String(context.args.text) }; } }));
    const results = await Promise.all(['first', 'second'].map((text) => dispatcher.dispatchPrefix(`!echo ${text}`, actor)));
    expect(results.map((result) => result?.content)).toEqual(['first', 'second']);
    registry.register(command({ name: 'failure', async execute() { await Promise.resolve(); throw new Error('secret-provider-token'); } }));
    const result = await dispatcher.dispatchPrefix('!failure test', actor);
    expect(errorCode(result)).toBe('INTERNAL');
    expect(result?.content).not.toContain('secret-provider-token');
  });

  it('normalizes mentions and choices and rejects malformed slash arguments', async () => {
    const { registry, dispatcher } = fixture();
    registry.register(command({ options: [{ name: 'user', description: 'User.', type: 'user', required: true }], execute: (context) => Promise.resolve({ kind: 'text', content: String(context.args.user) }) }));
    expect((await dispatcher.dispatchPrefix('!echo <@!100>', actor))?.content).toBe('100');
    expect(errorCode(await dispatcher.dispatchPrefix('!echo <#100>', actor))).toBe('VALIDATION');
    expect(errorCode(await dispatcher.dispatch({ name: 'echo', transport: 'slash', actor, args: { unexpected: true } }))).toBe('VALIDATION');
    const options: readonly CommandOption[] = [{ name: 'text', description: 'Choice.', type: 'string', choices: [{ name: 'One', value: 'one' }] }];
    expect(() => parseArguments(['two'], options)).toThrow('valid value');
  });
});

describe('access and dynamic help', () => {
  it('enforces member, bot, owner, and guild restrictions without owner bypass', async () => {
    const { registry, dispatcher } = fixture();
    registry.register(command({ guildOnly: true, ownerOnly: true, permissions: ['ManageGuild'], botPermissions: ['SendMessages'] }));
    const invoke = (who: ActorContext) => dispatcher.dispatch({ name: 'echo', transport: 'slash', actor: who, args: { text: 'hello' } });
    expect(errorCode(await invoke(actor))).toBe('FORBIDDEN');
    expect(errorCode(await invoke({ ...actor, isOwner: true, permissions: [] }))).toBe('FORBIDDEN');
    expect(errorCode(await invoke({ ...actor, isOwner: true, botPermissions: [] }))).toBe('BOT_PERMISSIONS');
    const dm: ActorContext = { userId: '100', roles: [], permissions: [], botPermissions: [], isOwner: true };
    expect(errorCode(await invoke(dm))).toBe('GUILD_ONLY');
    expect(await dispatcher.dispatchPrefix('!echo test', dm)).toBeNull();
    expect((await invoke({ ...actor, isOwner: true, permissions: ['Administrator'] })).kind).toBe('text');
  });

  it.each([
    { policy: { enabled: false }, code: 'DISABLED' },
    { policy: { allowedRoleIds: ['999'] }, code: 'FORBIDDEN' },
    { policy: { channels: { '300': false } }, code: 'DISABLED' },
  ])('applies guild command policy identically through aliases and hides denied entries', async ({ policy, code }) => {
    const { registry, dispatcher, settings } = fixture({ guildId: '200', prefix: '!', modules: { core: true }, commands: { echo: policy }, revision: 1 });
    registry.register(command({ aliases: ['say'] }));
    expect(errorCode(await dispatcher.dispatchPrefix('!say hello', actor))).toBe(code);
    expect(errorCode(await dispatcher.dispatch({ name: 'echo', transport: 'slash', actor, args: { text: 'hello' } }))).toBe(code);
    expect(registry.getHelp({ actor, settings: await settings.get('200') }).entries).toEqual([]);
  });

  it('fails closed on unloaded modules and settings errors', async () => {
    const { registry, dispatcher } = fixture();
    registry.register(command({ module: 'uninstalled' }));
    expect(errorCode(await dispatcher.dispatchPrefix('!echo hello', actor))).toBe('DISABLED');
    const broken = new CommandDispatcher({ registry, settings: { get: () => Promise.reject(new Error('database secret')), setPrefix: () => Promise.reject(new Error('unused')) } });
    expect(errorCode(await broken.dispatchPrefix('!echo hello', actor))).toBe('INTERNAL');
  });

  it('derives searchable paged help from visible metadata and applies the current prefix', async () => {
    const { registry, settings } = fixture({ guildId: '200', prefix: '$!', modules: { core: true }, commands: {}, revision: 1 });
    registry.register(command({ aliases: ['say'] }));
    registry.register(command({ name: 'hidden', hidden: true }));
    registry.register(command({ name: 'staff', permissions: ['BanMembers'] }));
    registry.register(command({ name: 'other', category: 'guild' }));
    const guildSettings = await settings.get('200');
    const help = registry.getHelp({ actor, settings: guildSettings, pageSize: 1, page: 2 });
    expect(help.total).toBe(2);
    expect(help.pageCount).toBe(2);
    expect(help.categories).toEqual(['general', 'guild']);
    expect(help.entries[0]?.prefixExamples[0]).toBe('$!echo hello');
    const search = registry.getHelp({ actor, settings: guildSettings, search: 'say', category: 'general' });
    expect(search.entries.map((entry) => entry.name)).toEqual(['echo']);
    expect(registry.getHelp({ actor, settings: guildSettings, page: 999 }).page).toBe(1);
  });
});

describe('cooldowns and built-ins', () => {
  it('shares cooldown across slash/prefix aliases, expires it, and prevents active-entry eviction', async () => {
    const f = fixture();
    f.registry.register(command({ aliases: ['say'], cooldownMs: 1000 }));
    expect((await f.dispatcher.dispatchPrefix('!say hello', actor))?.kind).toBe('text');
    expect(errorCode(await f.dispatcher.dispatch({ name: 'echo', transport: 'slash', actor, args: { text: 'hello' } }))).toBe('COOLDOWN');
    f.advance();
    expect((await f.dispatcher.dispatchPrefix('!echo again', actor))?.kind).toBe('text');
    let now = 100;
    const limited = new CommandDispatcher({ registry: f.registry, settings: f.settings, maxCooldownEntries: 1, clock: () => now });
    await limited.dispatchPrefix('!echo first', actor);
    expect(errorCode(await limited.dispatchPrefix('!echo second', { ...actor, userId: '101' }))).toBe('BUSY');
    expect(errorCode(await limited.dispatchPrefix('!say bypass', actor))).toBe('COOLDOWN');
    now += 1001;
    expect((await limited.dispatchPrefix('!echo recovered', { ...actor, userId: '101' }))?.kind).toBe('text');
  });

  it('implements prefix reads/writes on both paths with exact legacy newprefix name', async () => {
    const f = fixture();
    for (const definition of createBuiltinCommands(f.settings, f.registry)) f.registry.register(definition);
    expect((await f.dispatcher.dispatchPrefix('!prefix', actor))?.content).toBe('Server prefix: !');
    f.advance();
    expect((await f.dispatcher.dispatchPrefix('!setprefix "$!"', actor))?.content).toBe('Server prefix is now $!');
    expect(f.save).toHaveBeenCalledOnce();
    f.advance();
    expect((await f.dispatcher.dispatch({ name: 'prefix', transport: 'slash', actor, args: { newprefix: '?' } })).content).toBe('Server prefix is now ?');
    f.advance();
    expect((await f.dispatcher.dispatchPrefix('?prefix', actor))?.content).toBe('Server prefix: ?');
    f.advance();
    expect(errorCode(await f.dispatcher.dispatchPrefix('?prefix "bad prefix"', actor))).toBe('VALIDATION');
    expect(await f.dispatcher.dispatchPrefix('!prefix', actor)).toBeNull();
  });

  it('serves ping context menus and metadata help without registering future features', async () => {
    const f = fixture();
    for (const definition of createBuiltinCommands(f.settings, f.registry)) f.registry.register(definition);
    expect(f.registry.list().map((definition) => definition.name)).toEqual(['ping', 'prefix', 'help']);
    expect((await f.dispatcher.dispatch({ name: 'Ping from user context', transport: 'context', contextType: 'user', actor, args: {}, latencyMs: 12.2 })).content).toBe('Pong! Response latency: 12 ms.');
    f.advance();
    expect((await f.dispatcher.dispatch({ name: 'Ping from chat context', transport: 'context', contextType: 'message', actor, args: {} })).content).toBe('Pong!');
    expect(errorCode(await f.dispatcher.dispatch({ name: 'Ping from chat context', transport: 'context', contextType: 'user', actor, args: {} }))).toBe('NOT_FOUND');
    const help = await f.dispatcher.dispatchPrefix('!help --category guild', actor);
    expect(help?.kind).toBe('help');
    if (help?.kind === 'help') expect(help.entries.map((entry) => entry.name)).toEqual(['prefix']);
  });
});
