import { Test, TestingModule } from '@nestjs/testing';
import LickCommand from './lick.command';
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

describe('LickCommand', () => {
  let command: LickCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: LickCommand,
          useValue: new LickCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<LickCommand>(LickCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('lick');
    expect(command.regex).toEqual(new RegExp('^lick$|^lick ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['lick @user']);
    expect(command.reactionType).toBe('lick');
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
    it('should match valid lick commands', () => {
      expect(command.regex.test('lick')).toBe(true);
      expect(command.regex.test('lick @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('licks')).toBe(false);
      expect(command.regex.test('licking')).toBe(false);
      expect(command.regex.test('lic')).toBe(false);
    });
  });
});
