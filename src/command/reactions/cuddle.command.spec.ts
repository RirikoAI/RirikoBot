import { Test, TestingModule } from '@nestjs/testing';
import CuddleCommand from './cuddle.command';
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

describe('CuddleCommand', () => {
  let command: CuddleCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CuddleCommand,
          useValue: new CuddleCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<CuddleCommand>(CuddleCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('cuddle');
    expect(command.regex).toEqual(new RegExp('^cuddle$|^cuddle ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['cuddle @user']);
    expect(command.reactionType).toBe('cuddle');
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
    it('should match valid cuddle commands', () => {
      expect(command.regex.test('cuddle')).toBe(true);
      expect(command.regex.test('cuddle @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('cuddles')).toBe(false);
      expect(command.regex.test('cuddling')).toBe(false);
      expect(command.regex.test('cudd')).toBe(false);
    });
  });
});
