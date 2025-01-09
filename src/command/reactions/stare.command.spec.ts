import { Test, TestingModule } from '@nestjs/testing';
import StareCommand from './stare.command';
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

describe('StareCommand', () => {
  let command: StareCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: StareCommand,
          useValue: new StareCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<StareCommand>(StareCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('stare');
    expect(command.regex).toEqual(new RegExp('^stare$|^stare ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['stare @user']);
    expect(command.reactionType).toBe('stare');
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
    it('should match valid stare commands', () => {
      expect(command.regex.test('stare')).toBe(true);
      expect(command.regex.test('stare @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('stares')).toBe(false);
      expect(command.regex.test('staring')).toBe(false);
      expect(command.regex.test('sta')).toBe(false);
    });
  });
});
