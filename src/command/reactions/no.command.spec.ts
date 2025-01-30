import { Test, TestingModule } from '@nestjs/testing';
import NoCommand from './no.command';
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

describe('NoCommand', () => {
  let command: NoCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: NoCommand,
          useValue: new NoCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<NoCommand>(NoCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('no');
    expect(command.regex).toEqual(new RegExp('^no$|^no ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['no @user']);
    expect(command.reactionType).toBe('no');
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
    it('should match valid no commands', () => {
      expect(command.regex.test('no')).toBe(true);
      expect(command.regex.test('no @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('nos')).toBe(false);
      expect(command.regex.test('nono')).toBe(false);
      expect(command.regex.test('n')).toBe(false);
    });
  });
});
