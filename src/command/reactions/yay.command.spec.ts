import { Test, TestingModule } from '@nestjs/testing';
import YayCommand from './yay.command';
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

describe('YayCommand', () => {
  let command: YayCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: YayCommand,
          useValue: new YayCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<YayCommand>(YayCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('yay');
    expect(command.regex).toEqual(new RegExp('^yay$|^yay ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['yay @user']);
    expect(command.reactionType).toBe('yay');
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
    it('should match valid yay commands', () => {
      expect(command.regex.test('yay')).toBe(true);
      expect(command.regex.test('yay @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('yays')).toBe(false);
      expect(command.regex.test('yaying')).toBe(false);
      expect(command.regex.test('ya')).toBe(false);
    });
  });
});
