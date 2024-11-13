// @ts-nocheck
import { createMock } from '@golevelup/ts-jest';
import WallpaperCommand from '#command/anime/wallpaper.command';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';
import { CommandFeatures } from '#command/command.features';
import { Logger } from '@nestjs/common';

jest.mock('#command/command.features');
jest.mock('anime-wallpaper');
jest.mock('@nestjs/common', () => ({
  ...jest.requireActual('@nestjs/common'),
  Logger: {
    error: jest.fn(),
  },
}));

describe('WallpaperCommand', () => {
  let wallpaperCommand: WallpaperCommand;
  let mockMessage: DiscordMessage;
  let mockInteraction: DiscordInteraction;

  beforeEach(() => {
    wallpaperCommand = new WallpaperCommand(createMock<CommandFeatures>());
    mockMessage = createMock<DiscordMessage>();
    mockInteraction = createMock<DiscordInteraction>();
  });

  it('should set the correct properties', () => {
    expect(wallpaperCommand.regex).toEqual(
      new RegExp('^wallpaper$|^wallpaper ', 'i'),
    );
    expect(wallpaperCommand.category).toBe('anime');
    expect(wallpaperCommand.usageExamples).toEqual(['wallpaper <keyword>']);
  });

  it('should run prefix command and search for wallpaper', async () => {
    mockMessage.content = 'wallpaper naruto';
    expect(wallpaperCommand.name).toBe('wallpaper');
    expect(wallpaperCommand.description).toBe('Get random anime wallpaper');
    const selectSourceSpy = jest
      .spyOn(wallpaperCommand, 'selectSource')
      .mockResolvedValue();

    await wallpaperCommand.runPrefix(mockMessage);

    expect(wallpaperCommand.currentUserSearch).toEqual([
      { userId: mockMessage.author.id, search: 'naruto' },
    ]);
    expect(selectSourceSpy).toHaveBeenCalledWith({
      interaction: mockMessage,
      search: 'naruto',
    });
  });

  it('should run slash command and search for wallpaper', async () => {
    mockInteraction.options.getString = jest.fn().mockReturnValue('naruto');
    const selectSourceSpy = jest
      .spyOn(wallpaperCommand, 'selectSource')
      .mockResolvedValue();

    await wallpaperCommand.runSlash(mockInteraction);

    expect(wallpaperCommand.currentUserSearch).toEqual([
      { userId: mockInteraction.user.id, search: 'naruto' },
    ]);
    expect(selectSourceSpy).toHaveBeenCalledWith({
      interaction: mockInteraction,
      search: 'naruto',
    });
  });

  it('should handle source selection', async () => {
    const mockInteraction = createMock<DiscordInteraction>();
    const mockReply = {
      content: 'Here is the wallpaper',
      files: ['image_url'],
    };
    jest.spyOn(wallpaperCommand, 'getWallpapers').mockResolvedValue(mockReply);
    const createMenuSpy = jest
      .spyOn(wallpaperCommand, 'createMenu')
      .mockResolvedValue();

    await wallpaperCommand.handleSourceSelection(
      mockInteraction,
      'WallHaven&&&&naruto&&&&WallHaven&&&&123456',
    );

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(mockInteraction.editReply).toHaveBeenCalledWith(mockReply);
    expect(createMenuSpy).toHaveBeenCalled();
  });

  it('should handle next action and search again', async () => {
    const mockInteraction = createMock<DiscordInteraction>();
    wallpaperCommand.currentUserSearch = [
      { userId: mockInteraction.user.id, search: 'naruto' },
    ];
    const selectSourceSpy = jest
      .spyOn(wallpaperCommand, 'selectSource')
      .mockResolvedValue();

    await wallpaperCommand.handleNextAction(mockInteraction, 'another_source');

    expect(selectSourceSpy).toHaveBeenCalledWith({
      interaction: mockInteraction,
      search: 'naruto',
      followUp: true,
    });
  });

  it('should handle next action and exit', async () => {
    const mockInteraction = createMock<DiscordInteraction>();
    wallpaperCommand.currentUserSearch = [
      { userId: mockInteraction.user.id, search: 'naruto' },
    ];

    await wallpaperCommand.handleNextAction(mockInteraction, 'no');

    expect(wallpaperCommand.currentUserSearch).toEqual([]);
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      'Thank you for using the wallpaper command. Made with ❤️ by Ririko',
    );
  });

  it('should log error if getWallpapers throws an error', async () => {
    const mockInteraction = createMock<DiscordInteraction>();
    jest
      .spyOn(wallpaperCommand, 'getWallpapers')
      .mockRejectedValue(new Error('Test error'));

    await wallpaperCommand.handleSourceSelection(
      mockInteraction,
      'WallHaven&&&&naruto&&&&WallHaven&&&&123456',
    );

    expect(Logger.error).toHaveBeenCalledWith(
      expect.any(Error),
      'Ririko CommandService',
    );
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      'An error occurred while fetching the wallpaper.',
    );
  });
});
