import { Test, TestingModule } from '@nestjs/testing';
import NuzzleCommand from './nuzzle.command';
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

describe('NuzzleCommand', () => {
  let command: NuzzleCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: NuzzleCommand,
          useValue: new NuzzleCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<NuzzleCommand>(NuzzleCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('nuzzle');
    expect(command.regex).toEqual(new RegExp('^nuzzle$|^nuzzle ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['nuzzle @user']);
    expect(command.reactionType).toBe('nuzzle');
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
    it('should match valid nuzzle commands', () => {
      expect(command.regex.test('nuzzle')).toBe(true);
      expect(command.regex.test('nuzzle @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('nuzzles')).toBe(false);
      expect(command.regex.test('nuzzling')).toBe(false);
      expect(command.regex.test('nuz')).toBe(false);
    });
  });
});
