import { Test, TestingModule } from '@nestjs/testing';
import SighCommand from './sigh.command';
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

describe('SighCommand', () => {
  let command: SighCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SighCommand,
          useValue: new SighCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SighCommand>(SighCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sigh');
    expect(command.regex).toEqual(new RegExp('^sigh$|^sigh ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sigh @user']);
    expect(command.reactionType).toBe('sigh');
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
    it('should match valid sigh commands', () => {
      expect(command.regex.test('sigh')).toBe(true);
      expect(command.regex.test('sigh @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('sighs')).toBe(false);
      expect(command.regex.test('sighing')).toBe(false);
      expect(command.regex.test('sig')).toBe(false);
    });
  });
});
