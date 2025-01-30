import { Test, TestingModule } from '@nestjs/testing';
import YesCommand from './yes.command';
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

describe('YesCommand', () => {
  let command: YesCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: YesCommand,
          useValue: new YesCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<YesCommand>(YesCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('yes');
    expect(command.regex).toEqual(new RegExp('^yes$|^yes ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['yes @user']);
    expect(command.reactionType).toBe('yes');
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
    it('should match valid yes commands', () => {
      expect(command.regex.test('yes')).toBe(true);
      expect(command.regex.test('yes @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('yess')).toBe(false);
      expect(command.regex.test('yessing')).toBe(false);
      expect(command.regex.test('ye')).toBe(false);
    });
  });
});
