import { Test, TestingModule } from '@nestjs/testing';
import SlowClapCommand from './slowclap.command';
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

describe('SlowClapCommand', () => {
  let command: SlowClapCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SlowClapCommand,
          useValue: new SlowClapCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SlowClapCommand>(SlowClapCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('slowclap');
    expect(command.regex).toEqual(new RegExp('^slowclap$|^slowclap ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['slowclap @user']);
    expect(command.reactionType).toBe('slowclap');
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
    it('should match valid slowclap commands', () => {
      expect(command.regex.test('slowclap')).toBe(true);
      expect(command.regex.test('slowclap @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('slowclaps')).toBe(false);
      expect(command.regex.test('slowclapping')).toBe(false);
      expect(command.regex.test('slow')).toBe(false);
    });
  });
});
