import { Test, TestingModule } from '@nestjs/testing';
import SlapCommand from './slap.command';
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

describe('SlapCommand', () => {
  let command: SlapCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SlapCommand,
          useValue: new SlapCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SlapCommand>(SlapCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('slap');
    expect(command.regex).toEqual(new RegExp('^slap$|^slap ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['slap @user']);
    expect(command.reactionType).toBe('slap');
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
    it('should match valid slap commands', () => {
      expect(command.regex.test('slap')).toBe(true);
      expect(command.regex.test('slap @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('slaps')).toBe(false);
      expect(command.regex.test('slapping')).toBe(false);
      expect(command.regex.test('sla')).toBe(false);
    });
  });
});
