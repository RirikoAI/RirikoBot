import { Test, TestingModule } from '@nestjs/testing';
import HandholdCommand from './handhold.command';
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

describe('HandholdCommand', () => {
  let command: HandholdCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: HandholdCommand,
          useValue: new HandholdCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<HandholdCommand>(HandholdCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('handhold');
    expect(command.regex).toEqual(new RegExp('^handhold$|^handhold ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['handhold @user']);
    expect(command.reactionType).toBe('handhold');
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
    it('should match valid handhold commands', () => {
      expect(command.regex.test('handhold')).toBe(true);
      expect(command.regex.test('handhold @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('handholds')).toBe(false);
      expect(command.regex.test('handholding')).toBe(false);
      expect(command.regex.test('hand')).toBe(false);
    });
  });
});
