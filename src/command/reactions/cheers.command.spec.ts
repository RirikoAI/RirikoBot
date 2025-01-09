import { Test, TestingModule } from '@nestjs/testing';
import CheersCommand from './cheers.command';
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

describe('CheersCommand', () => {
  let command: CheersCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CheersCommand,
          useValue: new CheersCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<CheersCommand>(CheersCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('cheers');
    expect(command.regex).toEqual(new RegExp('^cheers$|^cheers ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['cheers @user']);
    expect(command.reactionType).toBe('cheers');
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
    it('should match valid cheers commands', () => {
      expect(command.regex.test('cheers')).toBe(true);
      expect(command.regex.test('cheers @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('cheer')).toBe(false);
      expect(command.regex.test('cheerful')).toBe(false);
      expect(command.regex.test('cheersing')).toBe(false);
    });
  });
});
