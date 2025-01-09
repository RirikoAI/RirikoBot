import { Test, TestingModule } from '@nestjs/testing';
import SleepCommand from './sleep.command';
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

describe('SleepCommand', () => {
  let command: SleepCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SleepCommand,
          useValue: new SleepCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SleepCommand>(SleepCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sleep');
    expect(command.regex).toEqual(new RegExp('^sleep$|^sleep ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sleep @user']);
    expect(command.reactionType).toBe('sleep');
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
    it('should match valid sleep commands', () => {
      expect(command.regex.test('sleep')).toBe(true);
      expect(command.regex.test('sleep @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('sleeps')).toBe(false);
      expect(command.regex.test('sleeping')).toBe(false);
      expect(command.regex.test('slee')).toBe(false);
    });
  });
});
