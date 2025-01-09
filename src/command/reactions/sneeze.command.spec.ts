import { Test, TestingModule } from '@nestjs/testing';
import SneezeCommand from './sneeze.command';
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

describe('SneezeCommand', () => {
  let command: SneezeCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SneezeCommand,
          useValue: new SneezeCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SneezeCommand>(SneezeCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('sneeze');
    expect(command.regex).toEqual(new RegExp('^sneeze$|^sneeze ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['sneeze @user']);
    expect(command.reactionType).toBe('sneeze');
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
    it('should match valid sneeze commands', () => {
      expect(command.regex.test('sneeze')).toBe(true);
      expect(command.regex.test('sneeze @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('sneezes')).toBe(false);
      expect(command.regex.test('sneezing')).toBe(false);
      expect(command.regex.test('snee')).toBe(false);
    });
  });
});
