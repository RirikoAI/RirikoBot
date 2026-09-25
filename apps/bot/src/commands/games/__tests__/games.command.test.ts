import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGamesCommands } from '../index.js';
import { MiniGameSessionManager } from '@ririko/services';
import { GameEscrowService } from '@ririko/services';
import { TicTacToeEngine } from '@ririko/services';
import { RpsEngine } from '@ririko/services';
import type { BotServices } from '../../../services.js';
import type { CommandContext } from '@ririko/discord';

describe('Mini-Games Commands Suite (TASK-0922)', () => {
  let mockServices: BotServices;
  let sessionManager: MiniGameSessionManager;
  let escrowService: GameEscrowService;
  let tictactoeEngine: TicTacToeEngine;
  let rpsEngine: RpsEngine;
  let mockEconomyRepo: any;

  beforeEach(() => {
    sessionManager = new MiniGameSessionManager();
    mockEconomyRepo = {
      isAccountFrozen: vi.fn().mockResolvedValue(false),
      getOrCreateBalance: vi.fn().mockResolvedValue({
        userId: 'user-1',
        walletBalance: 1000,
        bankBalance: 0,
        bankCapacity: 10000,
        netWorth: 1000,
      }),
      modifyBalance: vi.fn().mockResolvedValue({
        balance: { walletBalance: 1000 },
        transaction: { id: 'tx-1' },
      }),
    };
    escrowService = new GameEscrowService(mockEconomyRepo);
    tictactoeEngine = new TicTacToeEngine(sessionManager);
    rpsEngine = new RpsEngine(sessionManager);

    mockServices = {
      gameSessionManager: sessionManager,
      gameEscrowService: escrowService,
      tictactoeEngine,
      rpsEngine,
      economyRepo: mockEconomyRepo,
    } as any;
  });

  describe('Command Registration & Aliases', () => {
    it('registers all 5 mini-game commands with proper metadata and legacy aliases', () => {
      const commands = createGamesCommands(mockServices);
      expect(commands).toHaveLength(5);

      const names = commands.map((c) => c.metadata.name);
      expect(names).toContain('tictactoe');
      expect(names).toContain('rps');
      expect(names).toContain('highlow');
      expect(names).toContain('coinflip');
      expect(names).toContain('dice');

      const ttt = commands.find((c) => c.metadata.name === 'tictactoe')!;
      expect(ttt.metadata.aliases).toContain('ttt');
      expect(ttt.metadata.aliases).toContain('tic-tac-toe');

      const rps = commands.find((c) => c.metadata.name === 'rps')!;
      expect(rps.metadata.aliases).toContain('rock-paper-scissors');

      const hl = commands.find((c) => c.metadata.name === 'highlow')!;
      expect(hl.metadata.aliases).toContain('high-low');
      expect(hl.metadata.aliases).toContain('hl');

      const cf = commands.find((c) => c.metadata.name === 'coinflip')!;
      expect(cf.metadata.aliases).toContain('coin-flip');
      expect(cf.metadata.aliases).toContain('cf');

      const dice = commands.find((c) => c.metadata.name === 'dice')!;
      expect(dice.metadata.aliases).toContain('roll');
    });
  });

  describe('Tic-Tac-Toe Command', () => {
    it('rejects playing against oneself', async () => {
      const [tttCmd] = createGamesCommands(mockServices);
      const replyFn = vi.fn().mockResolvedValue({} as any);

      const ctx: Partial<CommandContext> = {
        guild: { id: 'guild-1' } as any,
        channel: { id: 'channel-1' } as any,
        channelId: 'channel-1',
        user: { id: 'user-1', username: 'Alice', bot: false } as any,
        client: {
          user: { id: 'bot-id' },
          users: { cache: new Map() },
        } as any,
        options: {
          getUser: vi.fn().mockResolvedValue({ id: 'user-1', username: 'Alice', bot: false }),
          getInteger: vi.fn().mockReturnValue(null),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
        reply: replyFn,
      };

      await tttCmd!.execute(ctx as CommandContext);
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('cannot play Tic-Tac-Toe against yourself'),
        }),
      );
    });

    it('rejects if a player is already active in the channel', async () => {
      const [tttCmd] = createGamesCommands(mockServices);
      const replyFn = vi.fn().mockResolvedValue({} as any);

      // Pre-create an active session for user-1
      sessionManager.createSession({
        type: 'TICTACTOE',
        guildId: 'guild-1',
        channelId: 'channel-1',
        players: [
          { id: 'user-1', username: 'Alice' },
          { id: 'user-2', username: 'Bob' },
        ],
        metadata: {},
      });

      const ctx: Partial<CommandContext> = {
        guild: { id: 'guild-1' } as any,
        channel: { id: 'channel-1' } as any,
        channelId: 'channel-1',
        user: { id: 'user-1', username: 'Alice', bot: false } as any,
        client: {
          user: { id: 'bot-id' },
          users: { cache: new Map() },
        } as any,
        options: {
          getUser: vi.fn().mockResolvedValue({ id: 'user-2', username: 'Bob', bot: false }),
          getInteger: vi.fn().mockReturnValue(null),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
        reply: replyFn,
      };

      await tttCmd!.execute(ctx as CommandContext);
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('already have an active game in this channel'),
        }),
      );
    });

    it('creates game session and sends 3x3 interactive button grid', async () => {
      const [tttCmd] = createGamesCommands(mockServices);
      const replyFn = vi.fn().mockResolvedValue({
        fetch: vi.fn().mockResolvedValue({
          createMessageComponentCollector: vi.fn().mockReturnValue({
            on: vi.fn(),
          }),
        }),
      } as any);

      const ctx: Partial<CommandContext> = {
        guild: { id: 'guild-1' } as any,
        channel: { id: 'channel-1' } as any,
        channelId: 'channel-1',
        user: { id: 'user-1', username: 'Alice', bot: false } as any,
        client: {
          user: { id: 'bot-id' },
          users: { cache: new Map() },
        } as any,
        options: {
          getUser: vi.fn().mockResolvedValue({ id: 'user-2', username: 'Bob', bot: false }),
          getInteger: vi.fn().mockReturnValue(100),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
        reply: replyFn,
      };

      await tttCmd!.execute(ctx as CommandContext);

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([expect.anything()]),
          components: expect.arrayContaining([expect.anything()]),
        }),
      );
      expect(sessionManager.getSessionCount()).toBe(1);
    });
  });

  describe('Rock-Paper-Scissors Command', () => {
    it('executes instant prefix match against AI', async () => {
      const commands = createGamesCommands(mockServices);
      const rpsCmd = commands.find((c) => c.metadata.name === 'rps')!;
      const replyFn = vi.fn().mockResolvedValue({} as any);

      const ctx: Partial<CommandContext> = {
        guild: { id: 'guild-1' } as any,
        channel: { id: 'channel-1' } as any,
        channelId: 'channel-1',
        user: { id: 'user-1', username: 'Alice', bot: false } as any,
        client: {
          user: { id: 'bot-id' },
          users: { cache: new Map() },
        } as any,
        options: {
          getUser: vi.fn().mockResolvedValue(null),
          getInteger: vi.fn().mockReturnValue(null),
          getRawArgs: vi.fn().mockReturnValue(['rock']),
        } as any,
        reply: replyFn,
      };

      await rpsCmd.execute(ctx as CommandContext);

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '✂️ Rock-Paper-Scissors',
              }),
            }),
          ]),
        }),
      );
    });
  });

  describe('HighLow Command', () => {
    it('dispatches interactive Higher/Lower buttons and checks wager funds', async () => {
      const commands = createGamesCommands(mockServices);
      const hlCmd = commands.find((c) => c.metadata.name === 'highlow')!;
      const replyFn = vi.fn().mockResolvedValue({
        fetch: vi.fn().mockResolvedValue({
          createMessageComponentCollector: vi.fn().mockReturnValue({
            on: vi.fn(),
          }),
        }),
      } as any);

      const ctx: Partial<CommandContext> = {
        guild: { id: 'guild-1' } as any,
        channel: { id: 'channel-1' } as any,
        channelId: 'channel-1',
        user: { id: 'user-1', username: 'Alice', bot: false } as any,
        client: {
          user: { id: 'bot-id' },
        } as any,
        options: {
          getInteger: vi.fn().mockReturnValue(50),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
        reply: replyFn,
      };

      await hlCmd.execute(ctx as CommandContext);

      expect(mockEconomyRepo.modifyBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          walletDelta: -50,
          type: 'GAME_ESCROW',
        }),
      );
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.arrayContaining([expect.anything()]),
        }),
      );
    });
  });

  describe('CoinFlip Command', () => {
    it('flips coin and renders result embed matching legacy format', async () => {
      const commands = createGamesCommands(mockServices);
      const cfCmd = commands.find((c) => c.metadata.name === 'coinflip')!;
      const replyFn = vi.fn().mockResolvedValue({} as any);

      const ctx: Partial<CommandContext> = {
        guild: { id: 'guild-1' } as any,
        channel: { id: 'channel-1' } as any,
        channelId: 'channel-1',
        user: { id: 'user-1', username: 'Alice', bot: false } as any,
        client: {
          user: { id: 'bot-id' },
        } as any,
        options: {
          getString: vi.fn().mockReturnValue('heads'),
          getInteger: vi.fn().mockReturnValue(100),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
        reply: replyFn,
      };

      await cfCmd.execute(ctx as CommandContext);

      expect(mockEconomyRepo.modifyBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          walletDelta: -100,
          type: 'GAME_ESCROW',
        }),
      );
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: 'Coin Flip',
              }),
            }),
          ]),
        }),
      );
    });
  });

  describe('Dice Command', () => {
    it('rolls single dice with legacy description format', async () => {
      const commands = createGamesCommands(mockServices);
      const diceCmd = commands.find((c) => c.metadata.name === 'dice')!;
      const replyFn = vi.fn().mockResolvedValue({} as any);

      const ctx: Partial<CommandContext> = {
        guild: { id: 'guild-1' } as any,
        channel: { id: 'channel-1' } as any,
        channelId: 'channel-1',
        user: { id: 'user-1', username: 'Alice', bot: false } as any,
        client: {
          user: { id: 'bot-id' },
        } as any,
        options: {
          getInteger: vi.fn().mockReturnValue(null),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
        reply: replyFn,
      };

      await diceCmd.execute(ctx as CommandContext);

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: 'Dice Roll',
                description: expect.stringMatching(
                  /You rolled a dice and it landed on \*\*\d+\*\*/,
                ),
              }),
            }),
          ]),
        }),
      );
    });

    it('rolls off against Ririko with wager escrow', async () => {
      const commands = createGamesCommands(mockServices);
      const diceCmd = commands.find((c) => c.metadata.name === 'dice')!;
      const replyFn = vi.fn().mockResolvedValue({} as any);

      const ctx: Partial<CommandContext> = {
        guild: { id: 'guild-1' } as any,
        channel: { id: 'channel-1' } as any,
        channelId: 'channel-1',
        user: { id: 'user-1', username: 'Alice', bot: false } as any,
        client: {
          user: { id: 'bot-id' },
        } as any,
        options: {
          getInteger: vi.fn().mockImplementation((name: string) => (name === 'wager' ? 75 : null)),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
        reply: replyFn,
      };

      await diceCmd.execute(ctx as CommandContext);

      expect(mockEconomyRepo.modifyBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          walletDelta: -75,
          type: 'GAME_ESCROW',
        }),
      );
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: 'Dice Roll-off',
              }),
            }),
          ]),
        }),
      );
    });
  });
});
