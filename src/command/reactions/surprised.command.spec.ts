import { Test, TestingModule } from '@nestjs/testing';
import SurprisedCommand from './surprised.command';
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

describe('SurprisedCommand', () => {
  let command: SurprisedCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SurprisedCommand,
          useValue: new SurprisedCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SurprisedCommand>(SurprisedCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('surprised');
    expect(command.regex).toEqual(new RegExp('^surprised$|^surprised ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['surprised @user']);
    expect(command.reactionType).toBe('surprised');
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
    it('should match valid surprised commands', () => {
      expect(command.regex.test('surprised')).toBe(true);
      expect(command.regex.test('surprised @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('surprises')).toBe(false);
      expect(command.regex.test('surprising')).toBe(false);
      expect(command.regex.test('surp')).toBe(false);
    });
  });
});
