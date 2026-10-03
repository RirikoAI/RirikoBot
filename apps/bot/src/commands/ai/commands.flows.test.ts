import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabaseClient, type DatabaseClient } from '@ririko/database';
import { PermissionFlagsBits } from 'discord.js';
import type { ChatModelProvider, ChatRequest, ChatResponse, ChatToken, ToolCall } from '@ririko/ai';
import { createBotServices, type BotServices } from '../../services.js';
import { AiChatController } from '../../controllers/ai-chat.controller.js';
import { createAiCommands, executeAiChatTurn } from './commands.js';

class ScriptedProvider implements ChatModelProvider {
  readonly id = 'scripted';
  readonly name = 'Scripted';
  readonly isAvailable = true;
  readonly supportedModels = ['scripted-model'];
  readonly defaultModel = 'scripted-model';

  text = 'Hello there!';
  toolCalls: ToolCall[] | undefined;
  synthesis: string | Error = 'All done.';
  requests: ChatRequest[] = [];

  async generate(request: ChatRequest): Promise<ChatResponse> {
    this.requests.push(request);
    const isSynthesis = !request.tools && request.messages.some((m) => m.role === 'tool');
    if (isSynthesis) {
      if (this.synthesis instanceof Error) throw this.synthesis;
      return { content: this.synthesis, model: 'scripted-model', provider: 'scripted' };
    }
    return {
      content: this.text,
      model: 'scripted-model',
      provider: 'scripted',
      toolCalls: request.tools ? this.toolCalls : undefined,
    };
  }

  async *stream(): AsyncIterable<ChatToken> {
    yield { text: this.text, isFinished: true };
  }
}

interface CtxOptions {
  guildId?: string | null;
  strings?: Record<string, string>;
  channel?: { id: string } | null;
  rawArgs?: string[];
  permissions?: bigint;
  source?: 'slash' | 'prefix';
  member?: Record<string, unknown> | null;
  guildExtras?: Record<string, unknown>;
}

function makeCtx(opts: CtxOptions = {}) {
  const replies: any[] = [];
  const edits: any[] = [];
  const perms = opts.permissions ?? 0n;
  const guild =
    opts.guildId === null
      ? null
      : {
          id: opts.guildId ?? 'guild-1',
          name: 'Test Guild',
          members: {
            me: { permissions: { bitfield: 8n }, roles: { highest: { position: 20 } } },
            fetch: vi.fn().mockResolvedValue(null),
          },
          voiceStates: { cache: new Map() },
          voiceAdapterCreator: {},
          ...opts.guildExtras,
        };
  const member =
    opts.member !== undefined
      ? opts.member
      : guild
        ? {
            displayName: 'Alice W',
            joinedAt: new Date('2025-01-02T00:00:00Z'),
            permissions: { has: (flag: bigint) => (perms & flag) !== 0n, bitfield: perms },
            roles: { highest: { position: 5 } },
          }
        : null;
  const ctx: any = {
    source: opts.source ?? 'slash',
    guild,
    guildId: guild?.id ?? null,
    channel: opts.channel === undefined ? { id: 'chan-1' } : opts.channel,
    channelId: 'chan-1',
    member,
    user: { id: 'user-1', username: 'Alice', displayAvatarURL: () => 'https://cdn/a.png' },
    options: {
      getString: (name: string) => opts.strings?.[name] ?? null,
      getChannel: async (name: string) =>
        name === 'channel' && opts.channel !== undefined ? opts.channel : null,
      getRawArgs: () => opts.rawArgs ?? [],
    },
    reply: vi.fn(async (r: unknown) => {
      replies.push(r);
      return {};
    }),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn(async (r: unknown) => {
      edits.push(r);
      return {};
    }),
  };
  return { ctx, replies, edits };
}

describe('AI commands - configuration and chat flows (TASK-1254)', () => {
  let db: DatabaseClient;
  let services: BotServices;
  let provider: ScriptedProvider;
  let invalidate: ReturnType<typeof vi.fn>;
  let commands: Map<string, (ctx: any) => Promise<void>>;
  let musicController: { updateController: ReturnType<typeof vi.fn> };

  const run = (name: string, ctx: unknown) => commands.get(name)!(ctx);

  beforeEach(async () => {
    db = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:', autoMigrate: true });
    services = await createBotServices(db);
    provider = new ScriptedProvider();
    services.fallbackChainManager.registerProvider(provider);
    invalidate = vi.fn();
    musicController = { updateController: vi.fn().mockResolvedValue(undefined) };
    const controller = {
      invalidateChannelCache: invalidate,
      musicController,
    } as unknown as AiChatController;
    commands = new Map(
      createAiCommands(services, controller).map((c) => [c.metadata.name, c.execute]),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.close();
  });

  describe('/ai dispatch', () => {
    it('greets when there is nothing to ask', async () => {
      const { ctx, replies } = makeCtx();
      await run('ai', ctx);
      expect(replies[0].content).toContain('Konnichiwa');
      expect(provider.requests).toHaveLength(0);
    });

    it('treats `!ai chat <text>` and `!ai <text>` as questions', async () => {
      const chat = makeCtx({ source: 'prefix', rawArgs: ['chat', 'Is', 'it', 'raining?'] });
      await run('ai', chat.ctx);
      expect(provider.requests[0]!.messages.at(-1)).toMatchObject({
        role: 'user',
        content: 'Is it raining?',
      });
      expect(chat.edits[0]).toEqual({ content: 'Hello there!' });

      const plain = makeCtx({ source: 'prefix', rawArgs: ['Hello', 'Ririko'] });
      await run('ai', plain.ctx);
      expect(provider.requests.at(-1)!.messages.at(-1)).toMatchObject({ content: 'Hello Ririko' });
    });

    it('greets for a bare `!ai chat`', async () => {
      const { ctx, replies } = makeCtx({ source: 'prefix', rawArgs: ['chat'] });
      await run('ai', ctx);
      expect(replies[0].content).toContain('Konnichiwa');
    });

    it('/chat asks for a question when none is given and reads prefix text otherwise', async () => {
      const empty = makeCtx();
      await run('chat', empty.ctx);
      expect(empty.replies[0].content).toContain('provide a question');

      const prefix = makeCtx({ source: 'prefix', rawArgs: ['Tell', 'me', 'a', 'joke'] });
      await run('chat', prefix.ctx);
      expect(provider.requests[0]!.messages.at(-1)).toMatchObject({ content: 'Tell me a joke' });
    });
  });

  describe('dedicated channel', () => {
    const manager = PermissionFlagsBits.ManageChannels;

    it('/ai channel needs a server and Manage Server or Manage Channels', async () => {
      const dm = makeCtx({ guildId: null, strings: { action: 'channel' } });
      await run('ai', dm.ctx);
      expect(dm.replies[0].content).toContain('only be configured in a server');

      const member = makeCtx({ strings: { action: 'channel' }, permissions: 0n });
      await run('ai', member.ctx);
      expect(member.replies[0].content).toContain('Manage Server** or **Manage Channels');
      expect(await services.conversationManager.getDedicatedChannel('guild-1')).toBeNull();
    });

    it('binds, shows and unsets the dedicated channel', async () => {
      const none = makeCtx({ strings: { action: 'channel' }, permissions: manager });
      await run('ai', none.ctx);
      expect(none.replies[0].content).toContain('No dedicated AI channel');

      const set = makeCtx({
        strings: { action: 'channel' },
        permissions: manager,
        channel: { id: 'ai-room' },
      });
      await run('ai', set.ctx);
      expect(set.replies[0].content).toContain('<#ai-room> is now configured');
      expect(await services.conversationManager.getDedicatedChannel('guild-1')).toBe('ai-room');
      expect(invalidate).toHaveBeenCalledWith('guild-1');

      const show = makeCtx({ strings: { action: 'channel' }, permissions: manager });
      await run('ai', show.ctx);
      expect(show.replies[0].content).toContain('Current dedicated AI channel is <#ai-room>');

      const reset = makeCtx({
        source: 'prefix',
        rawArgs: ['channel', 'Remove'],
        permissions: manager,
      });
      await run('ai', reset.ctx);
      expect(reset.replies[0].content).toContain('has been unset');
      expect(await services.conversationManager.getDedicatedChannel('guild-1')).toBeNull();
      expect(invalidate).toHaveBeenCalledTimes(2);
    });

    it('/aichannel binds the given or current channel, shows nothing new, and resets', async () => {
      const outside = makeCtx({ guildId: null });
      await run('aichannel', outside.ctx);
      expect(outside.replies).toHaveLength(0);

      const denied = makeCtx({ permissions: 0n });
      await run('aichannel', denied.ctx);
      expect(denied.replies[0].content).toContain('Manage Server** or **Manage Channels');

      const here = makeCtx({ permissions: manager });
      await run('aichannel', here.ctx);
      expect(here.replies[0].content).toContain('<#chan-1> is now configured');
      expect(await services.conversationManager.getDedicatedChannel('guild-1')).toBe('chan-1');

      const given = makeCtx({
        permissions: PermissionFlagsBits.ManageGuild,
        channel: { id: 'ai-2' },
      });
      await run('aichannel', given.ctx);
      expect(await services.conversationManager.getDedicatedChannel('guild-1')).toBe('ai-2');

      const reset = makeCtx({ permissions: manager, rawArgs: ['reset'] });
      await run('aichannel', reset.ctx);
      expect(reset.replies[0].content).toContain('has been unset');
      expect(await services.conversationManager.getDedicatedChannel('guild-1')).toBeNull();
    });

    it('/aichannel falls back to describing the setting when no channel can be resolved', async () => {
      await services.conversationManager.setDedicatedChannel('guild-1', 'existing');
      const withCurrent = makeCtx({ permissions: manager, channel: null });
      await run('aichannel', withCurrent.ctx);
      expect(withCurrent.replies[0].content).toBe('🤖 Current dedicated AI channel: <#existing>.');

      await services.conversationManager.removeDedicatedChannel('guild-1');
      const without = makeCtx({ permissions: manager, channel: null });
      await run('aichannel', without.ctx);
      expect(without.replies[0].content).toContain('No dedicated AI channel is configured');
    });
  });

  describe('persona', () => {
    const manage = PermissionFlagsBits.ManageGuild;

    it('/ai persona needs a server, and Manage Server to change anything', async () => {
      const dm = makeCtx({ guildId: null, strings: { action: 'persona' } });
      await run('ai', dm.ctx);
      expect(dm.replies[0].content).toContain('only available in a server');

      const denied = makeCtx({ strings: { action: 'persona', style: 'GENKI' }, permissions: 0n });
      await run('ai', denied.ctx);
      expect(denied.replies[0].content).toContain('**Manage Server** permission');
      expect(await services.conversationManager.getGuildPreferences('guild-1')).toBeNull();
    });

    it('/ai persona stores a style and prompt and then displays them', async () => {
      const set = makeCtx({
        strings: { action: 'persona', style: 'TSUNDERE', prompt: 'Be dramatic' },
        permissions: manage,
      });
      await run('ai', set.ctx);
      expect(set.replies[0].content).toContain('`TSUNDERE`');
      expect(set.replies[0].content).toContain('`Be dramatic`');

      const show = makeCtx({ strings: { action: 'persona' }, permissions: manage });
      await run('ai', show.ctx);
      const fields = show.replies[0].embeds[0].data.fields;
      expect(fields[0]).toMatchObject({ name: 'Current Style Preset', value: '`TSUNDERE`' });
      expect(fields[1].value).toBe('`Be dramatic`');
    });

    it('shows the defaults when nothing was configured', async () => {
      const show = makeCtx({ strings: { action: 'persona' } });
      await run('ai', show.ctx);
      const fields = show.replies[0].embeds[0].data.fields;
      expect(fields[0].value).toBe('`FRIENDLY_ANIME`');
      expect(fields[1].value).toBe('*None (using defaults)*');
    });

    it.each([
      [['persona', 'genki', 'Cheer', 'loudly'], 'Cheer loudly'],
      [['persona', 'Just', 'be', 'kind'], 'Just be kind'],
    ])('!ai %j takes the prompt from the prefix arguments', async (rawArgs, expected) => {
      const { ctx, replies } = makeCtx({ source: 'prefix', rawArgs, permissions: manage });
      await run('ai', ctx);
      expect(replies[0].content).toContain(`\`${expected}\``);
      const prefs = await services.conversationManager.getGuildPreferences('guild-1');
      expect(prefs?.personalityPrompt).toBe(expected);
    });

    it('/aipersona applies the same rules', async () => {
      const outside = makeCtx({ guildId: null });
      await run('aipersona', outside.ctx);
      expect(outside.replies).toHaveLength(0);

      const denied = makeCtx({ strings: { style: 'FORMAL' }, permissions: 0n });
      await run('aipersona', denied.ctx);
      expect(denied.replies[0].content).toContain('**Manage Server** permission');

      const style = makeCtx({ strings: { style: 'FORMAL' }, permissions: manage });
      await run('aipersona', style.ctx);
      expect(style.replies[0].content).toContain('• **Speaking Style**: `FORMAL`');
      expect(style.replies[0].content).toContain('**Custom Prompt**: *Unchanged*');

      const show = makeCtx({});
      await run('aipersona', show.ctx);
      expect(show.replies[0].embeds[0].data.fields[0].value).toBe('`FORMAL`');
    });

    it.each([
      [['kuudere', 'Stay', 'calm'], 'Stay calm'],
      [['Stay', 'very', 'calm'], 'Stay very calm'],
    ])('!aipersona %j parses the prompt', async (rawArgs, expected) => {
      const { ctx } = makeCtx({ source: 'prefix', rawArgs, permissions: manage });
      await run('aipersona', ctx);
      expect(
        (await services.conversationManager.getGuildPreferences('guild-1'))?.personalityPrompt,
      ).toBe(expected);
    });
  });

  describe('model choice', () => {
    it('/aimodel lists providers with the active server model', async () => {
      const { ctx, replies } = makeCtx({});
      await run('aimodel', ctx);
      const embed = replies[0].embeds[0].data;
      expect(embed.description).toBe('Active server model: **`(System Default)`**');
      expect(embed.fields.some((f: any) => f.name.includes('Scripted (scripted)'))).toBe(true);
      expect(embed.footer.text).toContain('/aimodel <model>');
    });

    it('needs a server to choose a model', async () => {
      const { ctx, replies } = makeCtx({ guildId: null, strings: { model: 'mistral' } });
      await run('aimodel', ctx);
      expect(replies[0].content).toBe('❌ The AI model is chosen per server.');
    });

    it('refuses a provider that is not configured', async () => {
      const { ctx, replies } = makeCtx({
        strings: { model: 'openai/gpt-4o-mini' },
        permissions: PermissionFlagsBits.ManageGuild,
      });
      await run('aimodel', ctx);
      expect(replies[0].content).toContain('is not configured for this bot');
      expect(await services.conversationManager.getGuildPreferences('guild-1')).toBeNull();
    });

    it('saves a model from the prefix argument, shows it, and resets with `default`', async () => {
      const manage = PermissionFlagsBits.ManageGuild;
      const save = makeCtx({ source: 'prefix', rawArgs: ['mistral'], permissions: manage });
      await run('aimodel', save.ctx);
      expect(save.replies[0].content).toContain('AI model saved');

      const list = makeCtx({});
      await run('aimodel', list.ctx);
      expect(list.replies[0].embeds[0].data.description).toContain('ollama/mistral');

      const reset = makeCtx({ strings: { model: 'default' }, permissions: manage });
      await run('aimodel', reset.ctx);
      expect(reset.replies[0].content).toContain('AI model reset');
      const prefs = await services.conversationManager.getGuildPreferences('guild-1');
      expect(prefs?.providerOverride).toBeNull();
      expect(prefs?.modelOverride).toBeNull();
    });

    it('/ai action:model takes the model from the prefix arguments', async () => {
      const { ctx, replies } = makeCtx({
        source: 'prefix',
        rawArgs: ['model', 'mistral'],
        permissions: PermissionFlagsBits.ManageGuild,
      });
      await run('ai', ctx);
      expect(replies[0].content).toContain('ollama/mistral');
    });

    it('lists the models in a DM without server preferences', async () => {
      const { ctx, replies } = makeCtx({ guildId: null });
      await run('aimodel', ctx);
      expect(replies[0].embeds[0].data.description).toContain('(System Default)');
    });
  });

  describe('memory', () => {
    it('/ai clear and /aiclear wipe only the caller context', async () => {
      const chat = makeCtx({ strings: { prompt: 'remember me' } });
      await run('chat', chat.ctx);
      const userContext = { userId: 'user-1', guildId: 'guild-1', channelId: 'chan-1' };
      expect(await services.conversationManager.getContextMessages(userContext, 10)).toHaveLength(
        2,
      );

      const clear = makeCtx({ source: 'prefix', rawArgs: ['clear'] });
      await run('ai', clear.ctx);
      expect(clear.replies[0].content).toContain('Memory Cleared');
      expect(await services.conversationManager.getContextMessages(userContext, 10)).toHaveLength(
        0,
      );
    });
  });

  describe('chat turn', () => {
    it('sends a no-response placeholder for an empty model answer', async () => {
      provider.text = '   ';
      const { ctx, edits } = makeCtx({ strings: { prompt: 'hi' } });
      await run('chat', ctx);
      expect(edits[0]).toEqual({ content: '*(No response generated)*' });
    });

    it('reports a provider failure to the user', async () => {
      vi.spyOn(services.fallbackChainManager, 'generate').mockRejectedValue(new Error('quota'));
      const { ctx, edits } = makeCtx({ strings: { prompt: 'hi' } });
      await run('chat', ctx);
      expect(edits[0]).toEqual({ content: '❌ **Ririko AI Error**: quota' });
    });

    it('stringifies a non-error failure too', async () => {
      vi.spyOn(services.fallbackChainManager, 'generate').mockRejectedValue('boom');
      const { ctx, edits } = makeCtx({ strings: { prompt: 'hi' } });
      await run('chat', ctx);
      expect(edits[0]).toEqual({ content: '❌ **Ririko AI Error**: boom' });
    });

    it('uses the server persona and the guild preferred provider in the request', async () => {
      await services.conversationManager.setGuildPreferences('guild-1', {
        speakingStyle: 'FORMAL',
        personalityPrompt: 'Always say please.',
      });
      const generate = vi.spyOn(services.fallbackChainManager, 'generate');
      const { ctx } = makeCtx({ strings: { prompt: 'hi' } });
      await run('chat', ctx);
      const request = generate.mock.calls[0]![0];
      expect(request.systemInstruction).toContain('Always say please.');
      expect(request.userContext).toMatchObject({
        userId: 'user-1',
        guildId: 'guild-1',
        displayName: 'Alice W',
      });
    });

    it('works in a direct message without server settings', async () => {
      const { ctx, edits } = makeCtx({ guildId: null, strings: { prompt: 'hi' } });
      await run('chat', ctx);
      expect(edits[0]).toEqual({ content: 'Hello there!' });
    });
  });

  describe('tool calls are mediated by the bot', () => {
    let seenContext: any;

    beforeEach(() => {
      provider.toolCalls = [{ id: 'call-1', name: 'play_music', arguments: { query: 'lofi' } }];
      seenContext = undefined;
    });

    const stubExecutor = (action: (context: any) => Promise<unknown>) => {
      vi.spyOn(services.toolExecutor, 'executeBatch').mockImplementation(async (calls, context) => {
        seenContext = context;
        const result = await action(context);
        return calls.map((c) => ({
          toolCallId: c.id,
          name: c.name,
          success: true,
          result,
        })) as never;
      });
    };

    it('passes permissions, role positions and the allowed tools to the executor', async () => {
      stubExecutor(async () => 'ok');
      const { ctx, edits } = makeCtx({ strings: { prompt: 'play lofi' }, permissions: 1n << 20n });
      await run('chat', ctx);
      expect(seenContext).toMatchObject({
        userId: 'user-1',
        guildId: 'guild-1',
        channelId: 'chan-1',
        userPermissions: 1n << 20n,
        botPermissions: 8n,
        userHighestRolePosition: 5,
        botHighestRolePosition: 20,
      });
      expect(edits[0]).toEqual({ content: 'All done.' });
      // The assistant turn with its tool call and the tool output are fed back for synthesis.
      const synthesis = provider.requests.find((r) => !r.tools)!;
      expect(synthesis.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
      expect(synthesis.messages.at(-1)).toMatchObject({ toolCallId: 'call-1', content: 'ok' });
    });

    it('serialises object results and errors for the model, and falls back when synthesis fails', async () => {
      vi.spyOn(services.toolExecutor, 'executeBatch').mockResolvedValue([
        { toolCallId: 'call-1', name: 'a', success: true, result: { n: 1 } },
        { toolCallId: 'call-2', name: 'b', success: false, error: 'denied' },
        { toolCallId: 'call-3', name: 'c', success: false },
      ] as never);
      provider.synthesis = new Error('synthesis down');
      const { ctx, edits } = makeCtx({ strings: { prompt: 'x' } });
      await run('chat', ctx);
      expect(edits[0].content.length).toBeGreaterThan(0);
      expect(edits[0].content).not.toContain('Ririko AI Error');
    });

    it('sends the tool content to the model as JSON', async () => {
      vi.spyOn(services.toolExecutor, 'executeBatch').mockResolvedValue([
        { toolCallId: 'call-1', name: 'a', success: true, result: { n: 1 } },
        { toolCallId: 'call-2', name: 'b', success: false, error: 'denied' },
        { toolCallId: 'call-3', name: 'c', success: false },
      ] as never);
      const { ctx } = makeCtx({ strings: { prompt: 'x' } });
      await run('chat', ctx);
      const tools = provider.requests
        .find((r) => !r.tools)!
        .messages.filter((m) => m.role === 'tool');
      expect(tools.map((m) => m.content)).toEqual([
        '{"n":1}',
        '{"error":"denied"}',
        '{"error":"Execution failed"}',
      ]);
    });

    it('resolves the member from the server when the context has none', async () => {
      stubExecutor(async () => 'ok');
      const voicePerms = 1n << 21n;
      const fetched = {
        voice: { channel: { permissionsFor: () => ({ bitfield: voicePerms }) } },
        roles: { highest: { position: 7 } },
      };
      const { ctx } = makeCtx({
        strings: { prompt: 'play lofi' },
        member: null,
        guildExtras: {
          members: {
            me: {
              permissions: { bitfield: 8n },
              voice: undefined,
              roles: { highest: { position: 20 } },
            },
            fetch: vi.fn().mockResolvedValue(fetched),
          },
        },
      });
      await run('chat', ctx);
      expect(seenContext.userPermissions).toBe(voicePerms);
      expect(seenContext.userHighestRolePosition).toBe(7);
    });

    it('prefers the permissions of the voice channel when the member is connected', async () => {
      stubExecutor(async () => 'ok');
      const voice = {
        channel: { permissionsFor: vi.fn().mockReturnValue({ bitfield: 99n }) },
        channelId: 'voice-1',
      };
      const { ctx } = makeCtx({
        strings: { prompt: 'x' },
        member: {
          displayName: 'A',
          permissions: { has: () => false, bitfield: 1n },
          roles: { highest: { position: 5 } },
          voice,
        },
      });
      await run('chat', ctx);
      expect(seenContext.userPermissions).toBe(99n);
      expect(seenContext.botPermissions).toBe(99n);
    });

    it('looks up the balance of any user through the economy repository', async () => {
      vi.spyOn(services.economyRepo, 'findById').mockImplementation(async (id: string) =>
        id === 'rich' ? ({ walletBalance: 5, bankBalance: 6, netWorth: 11 } as never) : null,
      );
      let balances: unknown[] = [];
      stubExecutor(async (context) => {
        balances = [await context.getBalance('rich'), await context.getBalance('nobody')];
        return 'ok';
      });
      const { ctx } = makeCtx({ strings: { prompt: 'x' } });
      await run('chat', ctx);
      expect(balances).toEqual([{ wallet: 5, bank: 6, netWorth: 11 }, null]);
    });

    describe('playMusic', () => {
      const play = async (
        setup: Partial<Parameters<typeof makeCtx>[0]> & { music?: unknown } = {},
        query = 'lofi beats',
      ) => {
        let outcome: any;
        stubExecutor(async (context) => {
          outcome = await context.playMusic(query);
          return 'ok';
        });
        const { music, ...options } = setup;
        if (music) vi.spyOn(services.musicPlayer, 'play').mockImplementation(music as never);
        const { ctx } = makeCtx({ strings: { prompt: 'play' }, ...options });
        await run('chat', ctx);
        return outcome;
      };

      const inVoice = {
        member: {
          displayName: 'A',
          permissions: { has: () => false, bitfield: 1n },
          roles: { highest: { position: 5 } },
          voice: { channelId: 'voice-1', channel: null },
        },
      };

      it('is only available in servers', async () => {
        expect(await play({ guildId: null })).toEqual({
          success: false,
          message: 'Music playback is only available in Discord servers.',
        });
      });

      it('asks the member to join a voice channel first', async () => {
        const outcome = await play({});
        expect(outcome.success).toBe(false);
        expect(outcome.message).toContain('connected to a voice channel');
      });

      it('finds the voice channel from the server voice states', async () => {
        const playSpy = vi.fn().mockResolvedValue({
          type: 'TRACK',
          track: { title: 'Song', artist: 'Band', url: 'https://song' },
          position: 0,
        });
        const outcome = await play({
          guildExtras: {
            voiceStates: { cache: new Map([['user-1', { channelId: 'voice-9' }]]) },
          },
          music: playSpy,
        });
        expect(playSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId: 'guild-1',
            voiceChannelId: 'voice-9',
            textChannelId: 'chan-1',
            query: 'lofi beats',
            member: { id: 'user-1', username: 'Alice', avatarUrl: 'https://cdn/a.png' },
          }),
        );
        expect(outcome).toMatchObject({
          success: true,
          trackTitle: 'Song',
          position: 0,
        });
        expect(outcome.message).toContain('"Song" by Band');
        expect(outcome.message).toContain('Now playing');
        expect(musicController.updateController).toHaveBeenCalledWith('guild-1');
      });

      it('describes a queued track with its position and an unknown artist', async () => {
        const outcome = await play({
          ...inVoice,
          music: vi.fn().mockResolvedValue({
            type: 'TRACK',
            track: { title: 'Song', url: 'https://song' },
            position: 3,
          }),
        });
        expect(outcome.message).toContain('by Unknown');
        expect(outcome.message).toContain('(Position: #3)');
      });

      it('describes a queued playlist', async () => {
        const outcome = await play({
          ...inVoice,
          music: vi.fn().mockResolvedValue({
            type: 'PLAYLIST',
            playlist: { title: 'Chill', url: 'https://pl' },
            tracksAdded: 12,
            position: 0,
          }),
        });
        expect(outcome).toMatchObject({
          success: true,
          trackTitle: 'Chill',
          trackUrl: 'https://pl',
        });
        expect(outcome.message).toContain('playlist "Chill" with 12 tracks');
        expect(musicController.updateController).toHaveBeenCalled();
      });

      it('says when nothing playable was found', async () => {
        const outcome = await play({
          ...inVoice,
          music: vi.fn().mockResolvedValue({ type: 'NONE' }),
        });
        expect(outcome).toEqual({
          success: false,
          message: 'Could not find any playable tracks for "lofi beats".',
        });
      });

      it('reports a player failure', async () => {
        const outcome = await play({
          ...inVoice,
          music: vi.fn().mockRejectedValue(new Error('no node')),
        });
        expect(outcome).toEqual({ success: false, message: 'Failed to play music: no node' });
        const stringFailure = await play({
          ...inVoice,
          music: vi.fn().mockRejectedValue('plain'),
        });
        expect(stringFailure.message).toBe('Failed to play music: plain');
      });
    });
  });

  describe('executeAiChatTurn', () => {
    it('can be called directly without a music controller', async () => {
      provider.toolCalls = [{ id: 'c', name: 'play_music', arguments: {} }];
      vi.spyOn(services.toolExecutor, 'executeBatch').mockImplementation(async (calls, context) => {
        await (context as any).playMusic('x');
        return calls.map((c) => ({
          toolCallId: c.id,
          name: c.name,
          success: true,
          result: 'ok',
        })) as never;
      });
      vi.spyOn(services.musicPlayer, 'play').mockResolvedValue({
        type: 'TRACK',
        track: { title: 'T', url: 'u' },
        position: 1,
      } as never);
      const { ctx, edits } = makeCtx({
        member: {
          displayName: 'A',
          permissions: { has: () => false, bitfield: 1n },
          roles: { highest: { position: 5 } },
          voice: { channelId: 'voice-1', channel: null },
        },
      });
      await executeAiChatTurn(ctx, services, 'play something');
      expect(edits[0]).toEqual({ content: 'All done.' });
    });
  });
});
