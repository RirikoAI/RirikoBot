import type { Command } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { createMemeCommand } from './meme.command.js';

export function createMemeCommands(services: BotServices): Command[] {
  return [createMemeCommand(services)];
}

export * from './meme.command.js';
