import { Test, TestingModule } from '@nestjs/testing';
import TiredCommand from './tired.command';
import { SlashCommandOptionTypes } from '#command/command.types';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { SharedServicesMock, TestSharedService } from '../../../test/mocks/shared-services.mock';

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

describe('TiredCommand', () => {
  let command: TiredCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: TiredCommand,
          useValue: new TiredCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<TiredCommand>(TiredCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('tired');
    expect(command.regex).toEqual(new RegExp('^tired$|^tired ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['tired @user']);
    expect(command.reactionType).toBe('tired');
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
    it('should match valid tired commands', () => {
      expect(command.regex.test('tired')).toBe(true);
      expect(command.regex.test('tired @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('tireds')).toBe(false);
      expect(command.regex.test('tiring')).toBe(false);
      expect(command.regex.test('tir')).toBe(false);
    });
  });
});
