import { Test, TestingModule } from '@nestjs/testing';
import CelebrateCommand from './celebrate.command';
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

describe('CelebrateCommand', () => {
  let command: CelebrateCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CelebrateCommand,
          useValue: new CelebrateCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<CelebrateCommand>(CelebrateCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('celebrate');
    expect(command.regex).toEqual(new RegExp('^celebrate$|^celebrate ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['celebrate @user']);
    expect(command.reactionType).toBe('celebrate');
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
    it('should match valid celebrate commands', () => {
      expect(command.regex.test('celebrate')).toBe(true);
      expect(command.regex.test('celebrate @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('celebrates')).toBe(false);
      expect(command.regex.test('celebration')).toBe(false);
      expect(command.regex.test('celebr')).toBe(false);
    });
  });
});
