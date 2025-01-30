import { Test, TestingModule } from '@nestjs/testing';
import WinkCommand from './wink.command';
import { SlashCommandOptionTypes } from '#command/command.types';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { SharedServicesMock, TestSharedService } from '../../../test/mocks/shared-services.mock';

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

describe('WinkCommand', () => {
  let command: WinkCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: WinkCommand,
          useValue: new WinkCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<WinkCommand>(WinkCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('wink');
    expect(command.regex).toEqual(new RegExp('^wink$|^wink ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['wink @user']);
    expect(command.reactionType).toBe('wink');
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
    it('should match valid wink commands', () => {
      expect(command.regex.test('wink')).toBe(true);
      expect(command.regex.test('wink @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('winks')).toBe(false);
      expect(command.regex.test('winking')).toBe(false);
      expect(command.regex.test('win')).toBe(false);
    });
  });
});
