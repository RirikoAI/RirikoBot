import type { Command } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { createAnimeCharacterCommand, createAnimeCommand, createMangaCommand } from './search.command.js';

export function createAnimeCommands(services: BotServices): Command[] {
  return [createAnimeCommand(services), createMangaCommand(services), createAnimeCharacterCommand(services)];
}

export * from './search.command.js';
export * from './embeds.js';
