import { Test, TestingModule } from '@nestjs/testing';
import PatCommand from './pat.command';
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

describe('PatCommand', () => {
  let command: PatCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PatCommand,
          useValue: new PatCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<PatCommand>(PatCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('pat');
    expect(command.regex).toEqual(new RegExp('^pat$|^pat ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['pat @user']);
    expect(command.reactionType).toBe('pat');
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
    it('should match valid pat commands', () => {
      expect(command.regex.test('pat')).toBe(true);
      expect(command.regex.test('pat @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('pats')).toBe(false);
      expect(command.regex.test('patting')).toBe(false);
      expect(command.regex.test('pa')).toBe(false);
    });
  });
});
