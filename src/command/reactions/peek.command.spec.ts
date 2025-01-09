import { Test, TestingModule } from '@nestjs/testing';
import PeekCommand from './peek.command';
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

describe('PeekCommand', () => {
  let command: PeekCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PeekCommand,
          useValue: new PeekCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<PeekCommand>(PeekCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('peek');
    expect(command.regex).toEqual(new RegExp('^peek$|^peek ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['peek @user']);
    expect(command.reactionType).toBe('peek');
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
    it('should match valid peek commands', () => {
      expect(command.regex.test('peek')).toBe(true);
      expect(command.regex.test('peek @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('peeks')).toBe(false);
      expect(command.regex.test('peeking')).toBe(false);
      expect(command.regex.test('pee')).toBe(false);
    });
  });
});
