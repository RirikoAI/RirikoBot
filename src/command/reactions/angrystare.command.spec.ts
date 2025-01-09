import { Test, TestingModule } from '@nestjs/testing';
import AngryStareCommand from './angrystare.command';
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

describe('AngryStareCommand', () => {
  let command: AngryStareCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: AngryStareCommand,
          useValue: new AngryStareCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<AngryStareCommand>(AngryStareCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('angrystare');
    expect(command.regex).toEqual(new RegExp('^angrystare$|^angrystare ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['angrystare @user']);
    expect(command.reactionType).toBe('angrystare');
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
    it('should match valid angrystare commands', () => {
      expect(command.regex.test('angrystare')).toBe(true);
      expect(command.regex.test('angrystare @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('angrystares')).toBe(false);
      expect(command.regex.test('stareangry')).toBe(false);
    });
  });
});
