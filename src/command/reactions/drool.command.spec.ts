import { Test, TestingModule } from '@nestjs/testing';
import DroolCommand from './drool.command';
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

describe('DroolCommand', () => {
  let command: DroolCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DroolCommand,
          useValue: new DroolCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<DroolCommand>(DroolCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('drool');
    expect(command.regex).toEqual(new RegExp('^drool$|^drool ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['drool @user']);
    expect(command.reactionType).toBe('drool');
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
    it('should match valid drool commands', () => {
      expect(command.regex.test('drool')).toBe(true);
      expect(command.regex.test('drool @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('drools')).toBe(false);
      expect(command.regex.test('drooling')).toBe(false);
      expect(command.regex.test('dro')).toBe(false);
    });
  });
});
