import { Test, TestingModule } from '@nestjs/testing';
import BiteCommand from './bite.command';
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

describe('BiteCommand', () => {
  let command: BiteCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: BiteCommand,
          useValue: new BiteCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<BiteCommand>(BiteCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('bite');
    expect(command.regex).toEqual(new RegExp('^bite$|^bite ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['bite @user']);
    expect(command.reactionType).toBe('bite');
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
    it('should match valid bite commands', () => {
      expect(command.regex.test('bite')).toBe(true);
      expect(command.regex.test('bite @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('bites')).toBe(false);
      expect(command.regex.test('bitey')).toBe(false);
    });
  });
});
