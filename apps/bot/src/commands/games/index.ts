import type { Command } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { createTicTacToeCommand } from './tictactoe.command.js';
import { createRpsCommand } from './rps.command.js';
import { createHighLowCommand } from './highlow.command.js';
import { createCoinFlipCommand } from './coinflip.command.js';
import { createDiceCommand } from './dice.command.js';

export function createGamesCommands(services: BotServices): Command[] {
  return [
    createTicTacToeCommand(services),
    createRpsCommand(services),
    createHighLowCommand(services),
    createCoinFlipCommand(services),
    createDiceCommand(services),
  ];
}

export * from './tictactoe.command.js';
export * from './rps.command.js';
export * from './highlow.command.js';
export * from './coinflip.command.js';
export * from './dice.command.js';
