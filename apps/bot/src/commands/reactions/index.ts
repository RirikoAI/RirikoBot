import type { Command } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { createReactCommand } from './react.command.js';

export function createReactionCommands(services: BotServices): Command[] {
  return [createReactCommand(services)];
}

export * from './react.command.js';
