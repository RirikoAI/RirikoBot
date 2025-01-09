import { Test, TestingModule } from '@nestjs/testing';
import RunCommand from './run.command';
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

describe('RunCommand', () => {
  let command: RunCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: RunCommand,
          useValue: new RunCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<RunCommand>(RunCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('run');
    expect(command.regex).toEqual(new RegExp('^run$|^run ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['run @user']);
    expect(command.reactionType).toBe('run');
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
    it('should match valid run commands', () => {
      expect(command.regex.test('run')).toBe(true);
      expect(command.regex.test('run @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('runs')).toBe(false);
      expect(command.regex.test('running')).toBe(false);
      expect(command.regex.test('ru')).toBe(false);
    });
  });
});
