import { Test, TestingModule } from '@nestjs/testing';
import RollCommand from './roll.command';
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

describe('RollCommand', () => {
  let command: RollCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: RollCommand,
          useValue: new RollCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<RollCommand>(RollCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('roll');
    expect(command.regex).toEqual(new RegExp('^roll$|^roll ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['roll @user']);
    expect(command.reactionType).toBe('roll');
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
    it('should match valid roll commands', () => {
      expect(command.regex.test('roll')).toBe(true);
      expect(command.regex.test('roll @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('rolls')).toBe(false);
      expect(command.regex.test('rolling')).toBe(false);
      expect(command.regex.test('rol')).toBe(false);
    });
  });
});
