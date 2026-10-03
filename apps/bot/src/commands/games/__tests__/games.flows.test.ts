import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  MiniGameSessionManager,
  GameEscrowService,
  TicTacToeEngine,
  RpsEngine,
} from '@ririko/services';
import { createGamesCommands } from '../index.js';
import type { BotServices } from '../../../services.js';

/* Games run against the real engines, session manager and escrow service with an in-memory
 * economy stub. Randomness is pinned: Math.random is scripted per test and the RPS AI
 * gets a fixed rngFn. */

const ALICE = { id: 'user-1', username: 'Alice', bot: false };
const BOB = { id: 'user-2', username: 'Bob', bot: false };

function fakeMessage() {
  const collector = Object.assign(new EventEmitter(), {
    stop: vi.fn(function (this: EventEmitter, reason: string) {
      this.emit('end', [], reason);
    }),
  });
  const message = {
    edit: vi.fn().mockResolvedValue(undefined),
    createMessageComponentCollector: vi.fn(() => collector),
  };
  return { message, collector };
}

function click(customId: string, userId: string) {
  return {
    customId,
    user: { id: userId },
    reply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

function buttons(payload: any): any[] {
  return payload.components.flatMap((row: any) => row.components.map((c: any) => c.data));
}

describe('mini-game commands (TASK-1254)', () => {
  let sessions: MiniGameSessionManager;
  let escrow: GameEscrowService;
  let economyRepo: any;
  let services: BotServices;
  let rpsRng: number;
  let guildSettings: ReturnType<typeof vi.fn>;

  const command = (name: string) =>
    createGamesCommands(services).find((c) => c.metadata.name === name)!;

  function makeCtx(
    opts: {
      user?: unknown;
      integers?: Record<string, number>;
      strings?: Record<string, string>;
      raw?: string[];
      opponent?: unknown;
      cacheUsers?: Array<[string, unknown]>;
    } = {},
    reply = vi.fn().mockResolvedValue(undefined),
  ) {
    return {
      ctx: {
        guild: { id: 'guild-1' },
        channel: { id: 'channel-1' },
        channelId: 'channel-1',
        user: opts.user ?? ALICE,
        client: {
          user: { id: 'bot-id' },
          users: { cache: new Map(opts.cacheUsers ?? []) },
        },
        options: {
          getUser: vi.fn().mockResolvedValue(opts.opponent ?? null),
          getInteger: vi.fn((name: string) => opts.integers?.[name] ?? null),
          getString: vi.fn((name: string) => opts.strings?.[name] ?? null),
          getRawArgs: vi.fn().mockReturnValue(opts.raw ?? []),
        },
        reply,
      } as any,
      reply,
    };
  }

  beforeEach(() => {
    rpsRng = 0;
    sessions = new MiniGameSessionManager();
    economyRepo = {
      isAccountFrozen: vi.fn().mockResolvedValue(false),
      getOrCreateBalance: vi.fn().mockResolvedValue({ walletBalance: 1000 }),
      modifyBalance: vi.fn().mockResolvedValue({ balance: {}, transaction: { id: 't' } }),
    };
    escrow = new GameEscrowService(economyRepo);
    guildSettings = vi.fn().mockResolvedValue({ maxGameWager: null });
    services = {
      gameSessionManager: sessions,
      gameEscrowService: escrow,
      tictactoeEngine: new TicTacToeEngine(sessions),
      rpsEngine: new RpsEngine(sessions, { rngFn: () => rpsRng }),
      economyRepo,
      guildSettingsService: { getSettings: guildSettings },
    } as unknown as BotServices;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const walletDeltas = () =>
    economyRepo.modifyBalance.mock.calls.map((c: any[]) => [c[0].userId, c[0].walletDelta]);

  describe('rps', () => {
    it('plays `!rps rock` instantly and refunds a tie', async () => {
      rpsRng = 0; // AI throws rock
      const { ctx, reply } = makeCtx({ raw: ['rock', '40'] });
      await command('rps').execute(ctx);
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toContain('**Alice** chose 🪨 Rock');
      expect(embed.description).toContain('**Ririko AI** chose 🪨 Rock');
      expect(embed.description).toContain("🤝 **It's a tie!** Wagers refunded.");
      expect(embed.color).toBe(0xfee75c);
      // Escrow only takes the human's stake, the tie gives it back.
      expect(walletDeltas()).toEqual([
        ['user-1', -40],
        ['user-1', 40],
      ]);
    });

    it('pays out a win against the AI', async () => {
      rpsRng = 0.9; // AI throws scissors
      const { ctx, reply } = makeCtx({ raw: ['rock', '50'] });
      await command('rps').execute(ctx);
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toContain('🏆 **You won!** You won **100 credits**!');
      expect(embed.color).toBe(0x57f287);
      expect(walletDeltas()).toContainEqual(['user-1', 100]);
    });

    it('reports a loss against the AI without paying anything back', async () => {
      rpsRng = 0.4; // AI throws paper
      const { ctx, reply } = makeCtx({ raw: ['ROCK', '25'] });
      await command('rps').execute(ctx);
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toContain(
        '😢 **Ririko won!** You lost your wager of **25 credits**.',
      );
      expect(embed.color).toBe(0xed4245);
      expect(walletDeltas()).toEqual([['user-1', -25]]);
    });

    it('plays instantly without a wager', async () => {
      rpsRng = 0.9;
      const { ctx, reply } = makeCtx({ raw: ['paper'] });
      await command('rps').execute(ctx);
      expect(reply.mock.calls[0]![0].embeds[0].data.description).toContain('😢 **Ririko won!**');
      expect(economyRepo.modifyBalance).not.toHaveBeenCalled();
    });

    it('rejects challenging yourself, busy players and over-limit wagers', async () => {
      let { ctx, reply } = makeCtx({ opponent: ALICE });
      await command('rps').execute(ctx);
      expect(reply).toHaveBeenCalledWith({
        content: '❌ You cannot challenge yourself to Rock-Paper-Scissors!',
        ephemeral: true,
      });

      sessions.createSession({
        type: 'RPS',
        guildId: 'guild-1',
        channelId: 'channel-1',
        players: [ALICE, BOB],
        metadata: {},
      } as any);
      ({ ctx, reply } = makeCtx({}));
      await command('rps').execute(ctx);
      expect(reply).toHaveBeenCalledWith({
        content: '❌ You already have an active game in this channel! Please finish it first.',
        ephemeral: true,
      });

      const carol = { id: 'user-3', username: 'Carol', bot: false };
      ({ ctx, reply } = makeCtx({ user: carol, opponent: BOB }));
      await command('rps').execute(ctx);
      expect(reply).toHaveBeenCalledWith({
        content: '❌ <@user-2> already has an active game in this channel!',
        ephemeral: true,
      });
    });

    it('refuses a wager above the server maximum and an unaffordable escrow', async () => {
      guildSettings.mockResolvedValue({ maxGameWager: 10 });
      let { ctx, reply } = makeCtx({ integers: { wager: 11 } });
      await command('rps').execute(ctx);
      expect(reply).toHaveBeenCalledWith({
        content: '❌ This server allows wagers of at most **10 credits**.',
        ephemeral: true,
      });

      guildSettings.mockResolvedValue({ maxGameWager: null });
      economyRepo.getOrCreateBalance.mockResolvedValue({ walletBalance: 5 });
      ({ ctx, reply } = makeCtx({ integers: { wager: 50 } }));
      await command('rps').execute(ctx);
      expect(reply.mock.calls[0]![0].content).toContain('❌ Wager Escrow Failed');
      expect(reply.mock.calls[0]![0].content).toContain('insufficient wallet credits');
      expect(sessions.getSessionCount()).toBe(0);
    });

    it('resolves a mention from the prefix arguments and reads a wager', async () => {
      const { message } = fakeMessage();
      const { ctx, reply } = makeCtx(
        { raw: ['<@!222222222222222222>', '30'] },
        vi.fn().mockResolvedValue(message),
      );
      ctx.client.users.cache.set('222222222222222222', {
        id: '222222222222222222',
        username: 'Bob',
        bot: false,
      });
      await command('rps').execute(ctx);
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toContain('**Alice** vs **Bob**');
      expect(embed.description).toContain('💰 **Wager**: 30 credits each');
      expect(embed.description).toContain('• Bob: Thinking 🤔');
    });

    describe('interactive match against a player', () => {
      let message: ReturnType<typeof fakeMessage>['message'];
      let collector: ReturnType<typeof fakeMessage>['collector'];
      let sessionId: string;
      let reply: ReturnType<typeof vi.fn>;

      const collect = (i: unknown) =>
        (collector.listeners('collect')[0] as (x: unknown) => Promise<void>)(i);

      async function startMatch(wager?: number) {
        ({ message, collector } = fakeMessage());
        const made = makeCtx(
          { opponent: BOB, integers: wager ? { wager } : {} },
          vi.fn().mockResolvedValue(message),
        );
        reply = made.reply;
        await command('rps').execute(made.ctx);
        sessionId = buttons(reply.mock.calls[0]![0])[0].custom_id.split(':')[2];
      }

      it('shows three choice buttons and a 60 second collector', async () => {
        await startMatch(20);
        const payload = reply.mock.calls[0]![0];
        expect(buttons(payload).map((b) => b.label)).toEqual(['Rock', 'Paper', 'Scissors']);
        expect(payload.embeds[0].data.description).toContain('Click a button below');
        expect(message.createMessageComponentCollector).toHaveBeenCalledWith(
          expect.objectContaining({ time: 60_000 }),
        );
        expect(walletDeltas()).toEqual([
          ['user-1', -20],
          ['user-2', -20],
        ]);
      });

      it('keeps choices hidden until both chose, then pays the winner', async () => {
        await startMatch(20);
        const first = click(`rps:choose:${sessionId}:ROCK`, 'user-1');
        await collect(first);
        expect(first.reply).toHaveBeenCalledWith({
          content: expect.stringContaining('You picked **🪨 Rock**'),
          ephemeral: true,
        });
        expect(message.edit.mock.calls[0]![0].embeds[0].data.description).toContain(
          '• Alice: Chosen ✅\n• Bob: Thinking 🤔',
        );

        const second = click(`rps:choose:${sessionId}:SCISSORS`, 'user-2');
        await collect(second);
        const final = message.edit.mock.calls[1]![0];
        expect(final.embeds[0].data.title).toBe('✂️ Rock-Paper-Scissors — Game Over');
        expect(final.embeds[0].data.description).toContain(
          '🏆 **Winner**: <@user-1> (Alice) wins!',
        );
        expect(final.embeds[0].data.description).toContain('Pot of **40 credits**');
        expect(buttons(final).every((b) => b.disabled)).toBe(true);
        expect(collector.stop).toHaveBeenCalledWith('game_over');
        expect(walletDeltas()).toContainEqual(['user-1', 40]);
      });

      it('refunds both players on a tie', async () => {
        await startMatch(20);
        await collect(click(`rps:choose:${sessionId}:PAPER`, 'user-1'));
        await collect(click(`rps:choose:${sessionId}:PAPER`, 'user-2'));
        const final = message.edit.mock.calls[1]![0];
        expect(final.embeds[0].data.description).toContain("🤝 **Result**: It's a tie!");
        expect(final.embeds[0].data.description).toContain('Wagers refunded to both players.');
        expect(walletDeltas().slice(-2)).toEqual([
          ['user-1', 20],
          ['user-2', 20],
        ]);
      });

      it('declares a winner without a wager', async () => {
        await startMatch();
        await collect(click(`rps:choose:${sessionId}:SCISSORS`, 'user-1'));
        await collect(click(`rps:choose:${sessionId}:ROCK`, 'user-2'));
        const description = message.edit.mock.calls[1]![0].embeds[0].data.description;
        expect(description).toContain('<@user-2> (Bob) wins!');
        expect(description).not.toContain('Pot of');
      });

      it('turns away spectators and ignores other sessions buttons', async () => {
        await startMatch();
        const spectator = click(`rps:choose:${sessionId}:ROCK`, 'user-9');
        await collect(spectator);
        expect(spectator.reply).toHaveBeenCalledWith({
          content: '❌ You are not a participant in this Rock-Paper-Scissors match!',
          ephemeral: true,
        });

        const stray = click('rps:choose:other-session:ROCK', 'user-1');
        await collect(stray);
        expect(stray.reply).not.toHaveBeenCalled();
      });

      it('rejects a second submission with the engine error', async () => {
        await startMatch();
        await collect(click(`rps:choose:${sessionId}:ROCK`, 'user-1'));
        const again = click(`rps:choose:${sessionId}:PAPER`, 'user-1');
        await collect(again);
        expect(again.reply).toHaveBeenCalledWith({
          content: '❌ Player user-1 has already submitted a choice',
          ephemeral: true,
        });
      });

      it('times out, refunds the stake and disables the buttons', async () => {
        await startMatch(20);
        await collect(click(`rps:choose:${sessionId}:ROCK`, 'user-1'));
        collector.emit('end', [], 'time');
        await vi.waitFor(() => expect(message.edit).toHaveBeenCalledTimes(2));
        const timeout = message.edit.mock.calls[1]![0];
        expect(timeout.embeds[0].data.title).toBe('✂️ Rock-Paper-Scissors — Timed Out');
        expect(buttons(timeout).every((b) => b.disabled)).toBe(true);
        expect(sessions.getSession(sessionId)?.state).toBe('TIMEOUT');
        expect(walletDeltas().slice(-2)).toEqual([
          ['user-1', 20],
          ['user-2', 20],
        ]);
      });

      it('ignores the end event of a finished game', async () => {
        await startMatch();
        collector.emit('end', [], 'game_over');
        expect(message.edit).not.toHaveBeenCalled();
      });

      it('stops quietly when the reply has no collector', async () => {
        const made = makeCtx({ opponent: BOB }, vi.fn().mockResolvedValue({}));
        await command('rps').execute(made.ctx);
        expect(made.reply).toHaveBeenCalledTimes(1);
      });
    });

    it('lets the AI match run interactively and fetches the reply message', async () => {
      const { message, collector } = fakeMessage();
      const { ctx, reply } = makeCtx(
        {},
        vi.fn().mockResolvedValue({ fetch: vi.fn().mockResolvedValue(message) }),
      );
      await command('rps').execute(ctx);
      expect(reply.mock.calls[0]![0].embeds[0].data.description).toContain('• Ririko AI: Ready ✅');
      const sessionId = buttons(reply.mock.calls[0]![0])[0].custom_id.split(':')[2];

      rpsRng = 0.4; // Too late to matter: the AI's secret choice (rock) was fixed when the match began.
      const handler = collector.listeners('collect')[0] as (x: unknown) => Promise<void>;
      await handler(click(`rps:choose:${sessionId}:PAPER`, 'user-1'));
      const final = message.edit.mock.calls[0]![0];
      expect(final.embeds[0].data.description).toContain('**Ririko AI** chose **🪨 Rock**');
      expect(final.embeds[0].data.description).toContain('<@user-1> (Alice) wins!');
    });
  });

  describe('tictactoe', () => {
    let message: ReturnType<typeof fakeMessage>['message'];
    let collector: ReturnType<typeof fakeMessage>['collector'];
    let reply: ReturnType<typeof vi.fn>;
    let sessionId: string;

    const collect = (i: unknown) =>
      (collector.listeners('collect')[0] as (x: unknown) => Promise<void>)(i);
    const move = (cell: number, userId: string) => click(`ttt:move:${sessionId}:${cell}`, userId);

    async function startGame(opts: Parameters<typeof makeCtx>[0] = {}) {
      ({ message, collector } = fakeMessage());
      const made = makeCtx({ opponent: BOB, ...opts }, vi.fn().mockResolvedValue(message));
      reply = made.reply;
      await command('tictactoe').execute(made.ctx);
      sessionId = buttons(reply.mock.calls[0]![0])[0].custom_id.split(':')[2];
    }

    it('asks for an opponent when none is given', async () => {
      const { ctx, reply: r } = makeCtx({ opponent: null });
      await command('tictactoe').execute(ctx);
      expect(r.mock.calls[0]![0].content).toContain('Please specify an opponent');
    });

    it('rejects an already-busy opponent', async () => {
      sessions.createSession({
        type: 'TICTACTOE',
        guildId: 'guild-1',
        channelId: 'channel-1',
        players: [BOB, { id: 'user-5', username: 'Eve' }],
        metadata: {},
      } as any);
      const { ctx, reply: r } = makeCtx({ opponent: BOB });
      await command('tictactoe').execute(ctx);
      expect(r).toHaveBeenCalledWith({
        content: '❌ <@user-2> already has an active game in this channel!',
        ephemeral: true,
      });
    });

    it('reports a failed wager escrow without creating a game', async () => {
      economyRepo.getOrCreateBalance.mockResolvedValue({ walletBalance: 1 });
      const { ctx, reply: r } = makeCtx({ opponent: BOB, integers: { wager: 100 } });
      await command('tictactoe').execute(ctx);
      expect(r.mock.calls[0]![0].content).toContain('❌ Wager Escrow Failed');
      expect(sessions.getSessionCount()).toBe(0);
    });

    it('parses `ai` and a wager from the prefix arguments', async () => {
      await startGame({ opponent: null, raw: ['ai', '60'] });
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toContain('**Alice** (❌) vs **Ririko AI** (⭕)');
      expect(embed.description).toContain('💰 **Wager**: 60 credits each');
      expect(walletDeltas()).toEqual([['user-1', -60]]);
    });

    it('resolves an opponent mention from the prefix arguments', async () => {
      await startGame({
        opponent: null,
        raw: ['<@222222222222222222>'],
        cacheUsers: [
          ['222222222222222222', { id: '222222222222222222', username: 'Bob', bot: false }],
        ],
      });
      expect(reply.mock.calls[0]![0].embeds[0].data.description).toContain('vs **Bob** (⭕)');
    });

    it('shows an empty board with whose turn it is', async () => {
      await startGame();
      const payload = reply.mock.calls[0]![0];
      expect(buttons(payload)).toHaveLength(9);
      expect(buttons(payload).every((b) => b.label === '⬛' && !b.disabled)).toBe(true);
      expect(payload.embeds[0].data.description).toContain('Current turn: <@user-1>');
    });

    it('enforces turn order and rejects an occupied cell', async () => {
      await startGame();
      const early = move(4, 'user-2');
      await collect(early);
      expect(early.reply).toHaveBeenCalledWith({
        content: '⏳ It is not your turn!',
        ephemeral: true,
      });

      await collect(move(4, 'user-1'));
      const clash = move(4, 'user-2');
      await collect(clash);
      expect(clash.reply.mock.calls[0]![0].content).toBe('❌ Cell 4 is already occupied by X');
    });

    it('ignores buttons from other games', async () => {
      await startGame();
      const stray = click('ttt:move:another-session:0', 'user-1');
      await collect(stray);
      expect(stray.reply).not.toHaveBeenCalled();
      expect(stray.update).not.toHaveBeenCalled();
    });

    it('plays a winning game, pays the pot and locks the board', async () => {
      await startGame({ integers: { wager: 50 } });
      const plays: Array<[number, string]> = [
        [0, 'user-1'],
        [3, 'user-2'],
        [1, 'user-1'],
        [4, 'user-2'],
      ];
      for (const [cell, user] of plays) await collect(move(cell, user));
      const winning = move(2, 'user-1');
      await collect(winning);

      const payload = winning.update.mock.calls[0]![0];
      expect(payload.embeds[0].data.title).toBe('🎮 Tic-Tac-Toe — Game Over');
      expect(payload.embeds[0].data.description).toContain(
        '🏆 **Winner**: <@user-1> (Alice) wins!',
      );
      expect(payload.embeds[0].data.description).toContain('Pot of **100 credits**');
      expect(payload.embeds[0].data.footer.text).toBe('Game concluded');
      expect(buttons(payload).every((b) => b.disabled)).toBe(true);
      expect(collector.stop).toHaveBeenCalledWith('game_over');
      expect(walletDeltas()).toContainEqual(['user-1', 100]);

      const late = move(5, 'user-2');
      await collect(late);
      expect(late.reply).toHaveBeenCalledWith({
        content: '⚠️ This game session has already ended or expired.',
        ephemeral: true,
      });
    });

    it('refunds both players on a tie', async () => {
      await startGame({ integers: { wager: 10 } });
      const order: Array<[number, string]> = [
        [0, 'user-1'],
        [1, 'user-2'],
        [2, 'user-1'],
        [4, 'user-2'],
        [3, 'user-1'],
        [5, 'user-2'],
        [7, 'user-1'],
        [6, 'user-2'],
      ];
      for (const [cell, user] of order) await collect(move(cell, user));
      const last = move(8, 'user-1');
      await collect(last);
      const description = last.update.mock.calls[0]![0].embeds[0].data.description;
      expect(description).toContain('🤝 **Result**: The game ended in a tie!');
      expect(description).toContain('Wagers of **10 credits** refunded');
      expect(last.update.mock.calls[0]![0].embeds[0].data.color).toBe(0xfee75c);
      expect(walletDeltas().slice(-2)).toEqual([
        ['user-1', 10],
        ['user-2', 10],
      ]);
    });

    it('answers a human move against the AI with the AI reply', async () => {
      await startGame({ opponent: null, raw: ['ai'] });
      const first = move(0, 'user-1');
      await collect(first);
      const payload = first.update.mock.calls[0]![0];
      const labels = buttons(payload).map((b) => b.label);
      expect(labels.filter((l) => l === '❌')).toHaveLength(1);
      expect(labels.filter((l) => l === '⭕')).toHaveLength(1);
      expect(payload.embeds[0].data.description).toContain('Current turn: <@user-1>');
    });

    it('forfeits on timeout, refunds the wager and disables the board', async () => {
      await startGame({ integers: { wager: 15 } });
      await collect(move(0, 'user-1'));
      collector.emit('end', [], 'time');
      await vi.waitFor(() => expect(message.edit).toHaveBeenCalled());
      const payload = message.edit.mock.calls[0]![0];
      expect(payload.embeds[0].data.title).toBe('🎮 Tic-Tac-Toe — Timed Out');
      expect(buttons(payload).every((b) => b.disabled)).toBe(true);
      expect(sessions.getSession(sessionId)?.state).toBe('TIMEOUT');
      expect(walletDeltas().slice(-2)).toEqual([
        ['user-1', 15],
        ['user-2', 15],
      ]);
    });

    it('leaves a finished game alone when the collector ends', async () => {
      await startGame();
      collector.emit('end', [], 'game_over');
      expect(message.edit).not.toHaveBeenCalled();
    });

    it('stops quietly when the reply has no collector', async () => {
      const made = makeCtx({ opponent: BOB }, vi.fn().mockResolvedValue({}));
      await command('tictactoe').execute(made.ctx);
      expect(made.reply).toHaveBeenCalledTimes(1);
    });
  });

  describe('highlow', () => {
    let message: ReturnType<typeof fakeMessage>['message'];
    let collector: ReturnType<typeof fakeMessage>['collector'];

    const collect = (i: unknown) =>
      (collector.listeners('collect')[0] as (x: unknown) => Promise<void>)(i);

    /** First Math.random call picks the shown number, the second the next number. */
    async function start(shown: number, next: number, opts: Parameters<typeof makeCtx>[0] = {}) {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce((shown - 0.5) / 100)
        .mockReturnValueOnce((next - 0.5) / 100);
      ({ message, collector } = fakeMessage());
      const made = makeCtx(opts, vi.fn().mockResolvedValue(message));
      await command('highlow').execute(made.ctx);
      const payload = made.reply.mock.calls[0]![0];
      return { reply: made.reply, payload, gameId: buttons(payload)[0].custom_id.split(':')[2] };
    }

    it('rejects a frozen account and insufficient funds', async () => {
      economyRepo.isAccountFrozen.mockResolvedValue(true);
      let made = makeCtx({ integers: { wager: 10 } });
      await command('highlow').execute(made.ctx);
      expect(made.reply).toHaveBeenCalledWith({
        content: '❌ Your economy account is frozen.',
        ephemeral: true,
      });

      economyRepo.isAccountFrozen.mockResolvedValue(false);
      economyRepo.getOrCreateBalance.mockResolvedValue({ walletBalance: 3 });
      made = makeCtx({ raw: ['10'] });
      await command('highlow').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toBe(
        '❌ Insufficient funds. You have 3 credits, but wager is 10.',
      );
      expect(economyRepo.modifyBalance).not.toHaveBeenCalled();
    });

    it('refuses a wager above the server maximum', async () => {
      guildSettings.mockResolvedValue({ maxGameWager: 5 });
      const made = makeCtx({ integers: { wager: 6 } });
      await command('highlow').execute(made.ctx);
      expect(made.reply.mock.calls[0]![0].content).toContain('at most **5 credits**');
    });

    it('pays double for a correct guess and reports the shown number', async () => {
      const { payload, gameId } = await start(40, 80, { raw: ['25'] });
      expect(payload.embeds[0].data.description).toContain('The number is **40**');
      expect(payload.embeds[0].data.description).toContain('💰 **Wager**: 25 credits');
      expect(message.createMessageComponentCollector).toHaveBeenCalledWith(
        expect.objectContaining({ time: 15_000, max: 1 }),
      );

      const guess = click(`hl:guess:${gameId}:higher`, 'user-1');
      await collect(guess);
      const result = guess.update.mock.calls[0]![0];
      expect(result.embeds[0].data.description).toContain(
        'The number is **80**. It was **higher** than **40**.',
      );
      expect(result.embeds[0].data.description).toContain('You won **50 credits**!');
      expect(buttons(result).every((b) => b.disabled)).toBe(true);
      expect(walletDeltas()).toEqual([
        ['user-1', -25],
        ['user-1', 50],
      ]);
    });

    it('takes the stake on a wrong guess', async () => {
      const { gameId } = await start(40, 10, { integers: { wager: 25 } });
      const guess = click(`hl:guess:${gameId}:higher`, 'user-1');
      await collect(guess);
      const embed = guess.update.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toContain('It was **lower** than **40**.');
      expect(embed.description).toContain('😢 **You guessed wrong!** You lost **25 credits**.');
      expect(embed.color).toBe(0xed4245);
      expect(walletDeltas()).toEqual([['user-1', -25]]);
    });

    it('refunds the wager when the number repeats', async () => {
      const { gameId } = await start(40, 40, { integers: { wager: 25 } });
      const guess = click(`hl:guess:${gameId}:lower`, 'user-1');
      await collect(guess);
      const embed = guess.update.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toContain('It was **the same** than **40**.');
      expect(embed.description).toContain('Wager refunded.');
      expect(walletDeltas().slice(-1)).toEqual([['user-1', 25]]);
    });

    it('plays without a wager and reports a win or loss without credits', async () => {
      const { gameId } = await start(40, 10);
      const guess = click(`hl:guess:${gameId}:lower`, 'user-1');
      await collect(guess);
      const embed = guess.update.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toContain('🎉 **You guessed correctly!**');
      expect(embed.description).not.toContain('credits');
      expect(economyRepo.modifyBalance).not.toHaveBeenCalled();
    });

    it('does not let someone else play the game', async () => {
      const { gameId } = await start(40, 80);
      const intruder = click(`hl:guess:${gameId}:higher`, 'user-2');
      await collect(intruder);
      expect(intruder.reply).toHaveBeenCalledWith({
        content: '❌ This HighLow game belongs to someone else!',
        ephemeral: true,
      });
      expect(intruder.update).not.toHaveBeenCalled();
    });

    it('refunds the wager when the player takes too long', async () => {
      await start(40, 80, { integers: { wager: 30 } });
      collector.emit('end', [], 'time');
      await vi.waitFor(() => expect(message.edit).toHaveBeenCalled());
      expect(message.edit.mock.calls[0]![0].embeds[0].data.description).toContain('too long');
      expect(message.edit.mock.calls[0]![0].components).toEqual([]);
      expect(walletDeltas().slice(-1)).toEqual([['user-1', 30]]);
    });

    it('does nothing at the end of a guessed game and when there is no collector', async () => {
      await start(40, 80);
      collector.emit('end', [], 'limit');
      expect(message.edit).not.toHaveBeenCalled();

      const made = makeCtx({}, vi.fn().mockResolvedValue({}));
      await command('highlow').execute(made.ctx);
      expect(made.reply).toHaveBeenCalledTimes(1);
    });
  });

  describe('coinflip', () => {
    const flip = async (random: number, opts: Parameters<typeof makeCtx>[0]) => {
      vi.spyOn(Math, 'random').mockReturnValue(random);
      const made = makeCtx(opts);
      await command('coinflip').execute(made.ctx);
      return made.reply;
    };

    it('requires a guess to place a wager', async () => {
      const reply = await flip(0.1, { integers: { wager: 10 } });
      expect(reply).toHaveBeenCalledWith({
        content: '❌ You must specify a guess (`heads` or `tails`) when placing a wager!',
        ephemeral: true,
      });
    });

    it('doubles the stake on a correct guess', async () => {
      const reply = await flip(0.1, { strings: { guess: 'Heads' }, integers: { wager: 10 } });
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toContain('landed on **Heads**');
      expect(embed.description).toContain('You won **20 credits**!');
      expect(embed.color).toBe(0x57f287);
      expect(walletDeltas()).toEqual([
        ['user-1', -10],
        ['user-1', 20],
      ]);
    });

    it('keeps the stake on a wrong guess given through prefix arguments', async () => {
      const reply = await flip(0.1, { raw: ['tails', '10'] });
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toContain('landed on **Heads**');
      expect(embed.description).toContain('You lost your wager of **10 credits**.');
      expect(embed.color).toBe(0xed4245);
      expect(walletDeltas()).toEqual([['user-1', -10]]);
    });

    it('reads a bare wager from the prefix arguments, then asks for a guess', async () => {
      const reply = await flip(0.9, { raw: ['25'] });
      expect(reply.mock.calls[0]![0].content).toContain('must specify a guess');
    });

    it('flips without a guess or wager and shows no verdict', async () => {
      const reply = await flip(0.9, {});
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toBe('You flipped a coin and it landed on **Tails**');
      expect(embed.color).toBe(0x0099ff);
    });

    it('honours the guess without a wager', async () => {
      const reply = await flip(0.9, { strings: { guess: 'tails' } });
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toContain('You guessed correctly!');
      expect(economyRepo.modifyBalance).not.toHaveBeenCalled();
    });

    it('refuses a frozen account and insufficient funds', async () => {
      economyRepo.isAccountFrozen.mockResolvedValue(true);
      let reply = await flip(0.1, { strings: { guess: 'heads' }, integers: { wager: 10 } });
      expect(reply).toHaveBeenCalledWith({
        content: '❌ Your economy account is frozen.',
        ephemeral: true,
      });
      economyRepo.isAccountFrozen.mockResolvedValue(false);
      economyRepo.getOrCreateBalance.mockResolvedValue({ walletBalance: 2 });
      reply = await flip(0.1, { strings: { guess: 'heads' }, integers: { wager: 10 } });
      expect(reply.mock.calls[0]![0].content).toContain('Insufficient funds');
      expect(economyRepo.modifyBalance).not.toHaveBeenCalled();
    });

    it('refuses a wager over the server maximum', async () => {
      guildSettings.mockResolvedValue({ maxGameWager: 5 });
      const reply = await flip(0.1, { strings: { guess: 'heads' }, integers: { wager: 6 } });
      expect(reply.mock.calls[0]![0].content).toContain('at most **5 credits**');
    });
  });

  describe('dice', () => {
    const roll = async (randoms: number[], opts: Parameters<typeof makeCtx>[0]) => {
      const spy = vi.spyOn(Math, 'random');
      for (const r of randoms) spy.mockReturnValueOnce(r);
      const made = makeCtx(opts);
      await command('dice').execute(made.ctx);
      return made.reply;
    };

    it('lists each die and the total for several dice', async () => {
      const reply = await roll([0, 0.5, 0.99], { integers: { count: 3, sides: 10 } });
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.title).toBe('Dice Roll');
      expect(embed.description).toBe('You rolled **3**d**10** dice: [1, 6, 10]\nTotal: **17**');
    });

    it('treats a prefix number up to 10 as a dice count', async () => {
      const reply = await roll([0, 0, 0, 0], { raw: ['4'] });
      expect(reply.mock.calls[0]![0].embeds[0].data.description).toContain('**4**d**6**');
    });

    it('wins the roll-off and doubles the stake', async () => {
      const reply = await roll([0.9, 0.1], { integers: { wager: 40 } });
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.title).toBe('Dice Roll-off');
      expect(embed.description).toContain('**You** rolled: **6**');
      expect(embed.description).toContain('**Ririko** rolled: **1**');
      expect(embed.description).toContain('Awarded **80 credits**');
      expect(walletDeltas()).toEqual([
        ['user-1', -40],
        ['user-1', 80],
      ]);
    });

    it('loses the roll-off, taking a prefix wager of more than 10 credits', async () => {
      const reply = await roll([0.1, 0.9], { raw: ['25'] });
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toContain('Ririko won the roll-off!');
      expect(embed.description).toContain('lost your wager of **25 credits**');
      expect(embed.color).toBe(0xed4245);
      expect(walletDeltas()).toEqual([['user-1', -25]]);
    });

    it('refunds the stake on a tied roll-off and reads `wager <n>` from prefix arguments', async () => {
      const reply = await roll([0.5, 0.5], { raw: ['wager', '12'] });
      const embed = reply.mock.calls[0]![0].embeds[0].data;
      expect(embed.description).toContain("It's a tie!");
      expect(embed.color).toBe(0xfee75c);
      expect(walletDeltas()).toEqual([
        ['user-1', -12],
        ['user-1', 12],
      ]);
    });

    it('refuses a frozen account, insufficient funds and an over-limit wager', async () => {
      economyRepo.isAccountFrozen.mockResolvedValue(true);
      let reply = await roll([], { integers: { wager: 10 } });
      expect(reply.mock.calls[0]![0].content).toBe('❌ Your economy account is frozen.');
      economyRepo.isAccountFrozen.mockResolvedValue(false);
      economyRepo.getOrCreateBalance.mockResolvedValue({ walletBalance: 1 });
      reply = await roll([], { integers: { wager: 10 } });
      expect(reply.mock.calls[0]![0].content).toContain('Insufficient funds');
      guildSettings.mockResolvedValue({ maxGameWager: 5 });
      reply = await roll([], { integers: { wager: 10 } });
      expect(reply.mock.calls[0]![0].content).toContain('at most **5 credits**');
      expect(economyRepo.modifyBalance).not.toHaveBeenCalled();
    });
  });
});
