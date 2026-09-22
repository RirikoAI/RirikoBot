import type { Command } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import { createAnimeCharacterCommand, createAnimeCommand, createMangaCommand } from './search.command.js';
import { createWaifuCommand } from './waifu.command.js';
import { createWallpaperCommand } from './wallpaper.command.js';

export function createAnimeCommands(services: BotServices): Command[] {
  return [
    createAnimeCommand(services),
    createMangaCommand(services),
    createAnimeCharacterCommand(services),
    createWaifuCommand(services),
    createWallpaperCommand(services),
  ];
}

export * from './search.command.js';
export * from './embeds.js';
export * from './waifu.command.js';
export * from './wallpaper.command.js';
