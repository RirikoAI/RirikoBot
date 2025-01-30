import { Test, TestingModule } from '@nestjs/testing';
import SadCommand from './sad.command';
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

describe('SadCommand', () => {
  let command: SadCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SadCommand,
          useValue: new SadCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SadCommand>(SadCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sad');
    expect(command.regex).toEqual(new RegExp('^sad$|^sad ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sad @user']);
    expect(command.reactionType).toBe('sad');
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
    it('should match valid sad commands', () => {
      expect(command.regex.test('sad')).toBe(true);
      expect(command.regex.test('sad @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('sads')).toBe(false);
      expect(command.regex.test('sadness')).toBe(false);
      expect(command.regex.test('sa')).toBe(false);
    });
  });
});
