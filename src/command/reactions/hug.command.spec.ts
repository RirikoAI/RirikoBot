import { Test, TestingModule } from '@nestjs/testing';
import HugCommand from './hug.command';
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

describe('HugCommand', () => {
  let command: HugCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: HugCommand,
          useValue: new HugCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<HugCommand>(HugCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('hug');
    expect(command.regex).toEqual(new RegExp('^hug$|^hug ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['hug @user']);
    expect(command.reactionType).toBe('hug');
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
    it('should match valid hug commands', () => {
      expect(command.regex.test('hug')).toBe(true);
      expect(command.regex.test('hug @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('hugs')).toBe(false);
      expect(command.regex.test('hugging')).toBe(false);
      expect(command.regex.test('hu')).toBe(false);
    });
  });
});
