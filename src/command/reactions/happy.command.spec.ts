import { Test, TestingModule } from '@nestjs/testing';
import HappyCommand from './happy.command';
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

describe('HappyCommand', () => {
  let command: HappyCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: HappyCommand,
          useValue: new HappyCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<HappyCommand>(HappyCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('happy');
    expect(command.regex).toEqual(new RegExp('^happy$|^happy ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['happy @user']);
    expect(command.reactionType).toBe('happy');
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
    it('should match valid happy commands', () => {
      expect(command.regex.test('happy')).toBe(true);
      expect(command.regex.test('happy @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('happys')).toBe(false);
      expect(command.regex.test('happiness')).toBe(false);
      expect(command.regex.test('hap')).toBe(false);
    });
  });
});
