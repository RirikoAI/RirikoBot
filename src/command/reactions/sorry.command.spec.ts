import { Test, TestingModule } from '@nestjs/testing';
import SorryCommand from './sorry.command';
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

describe('SorryCommand', () => {
  let command: SorryCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SorryCommand,
          useValue: new SorryCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SorryCommand>(SorryCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sorry');
    expect(command.regex).toEqual(new RegExp('^sorry$|^sorry ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sorry @user']);
    expect(command.reactionType).toBe('sorry');
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
    it('should match valid sorry commands', () => {
      expect(command.regex.test('sorry')).toBe(true);
      expect(command.regex.test('sorry @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('sorries')).toBe(false);
      expect(command.regex.test('sorrying')).toBe(false);
      expect(command.regex.test('sorr')).toBe(false);
    });
  });
});
