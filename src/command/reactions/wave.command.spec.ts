import { Test, TestingModule } from '@nestjs/testing';
import WaveCommand from './wave.command';
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

describe('WaveCommand', () => {
  let command: WaveCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: WaveCommand,
          useValue: new WaveCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<WaveCommand>(WaveCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('wave');
    expect(command.regex).toEqual(new RegExp('^wave$|^wave ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['wave @user']);
    expect(command.reactionType).toBe('wave');
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
    it('should match valid wave commands', () => {
      expect(command.regex.test('wave')).toBe(true);
      expect(command.regex.test('wave @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('waves')).toBe(false);
      expect(command.regex.test('waving')).toBe(false);
      expect(command.regex.test('wav')).toBe(false);
    });
  });
});
