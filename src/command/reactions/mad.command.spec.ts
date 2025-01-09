import { Test, TestingModule } from '@nestjs/testing';
import MadCommand from './mad.command';
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

describe('MadCommand', () => {
  let command: MadCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: MadCommand,
          useValue: new MadCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<MadCommand>(MadCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('mad');
    expect(command.regex).toEqual(new RegExp('^mad$|^mad ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['mad @user']);
    expect(command.reactionType).toBe('mad');
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
    it('should match valid mad commands', () => {
      expect(command.regex.test('mad')).toBe(true);
      expect(command.regex.test('mad @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('mads')).toBe(false);
      expect(command.regex.test('madness')).toBe(false);
      expect(command.regex.test('ma')).toBe(false);
    });
  });
});
