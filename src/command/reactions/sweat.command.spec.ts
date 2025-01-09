import { Test, TestingModule } from '@nestjs/testing';
import SweatCommand from './sweat.command';
import { SlashCommandOptionTypes } from '#command/command.types';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { SharedServicesMock, TestSharedService } from "../../../test/mocks/shared-services.mock";

const mockDiscordService = {
  client: {
    user: {
      displayAvatarURL: jest.fn(),
    },
  },
};
const mockCommandService = {
  getGuildPrefix: jest.fn(),
};
const mockSharedServices: SharedServicesMock = {
  ...TestSharedService,
  discord: mockDiscordService as unknown as DiscordService,
  commandService: mockCommandService as unknown as CommandService,
};

describe('SweatCommand', () => {
  let command: SweatCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SweatCommand,
          useValue: new SweatCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SweatCommand>(SweatCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sweat');
    expect(command.regex).toEqual(new RegExp('^sweat$|^sweat ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sweat @user']);
    expect(command.reactionType).toBe('sweat');
    expect(command.content).toEqual(expect.any(String));
    expect(command.noTargetContent).toEqual(expect.any(String));
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'target',
        description: expect.any(String),
        type: SlashCommandOptionTypes.User,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid sweat commands', () => {
      expect(command.regex.test('sweat')).toBe(true);
      expect(command.regex.test('sweat @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('sweats')).toBe(false);
      expect(command.regex.test('sweating')).toBe(false);
      expect(command.regex.test('swe')).toBe(false);
    });
  });
});
