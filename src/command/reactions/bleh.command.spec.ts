import { Test, TestingModule } from '@nestjs/testing';
import BlehCommand from './bleh.command';
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

describe('BlehCommand', () => {
  let command: BlehCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: BlehCommand,
          useValue: new BlehCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<BlehCommand>(BlehCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('bleh');
    expect(command.regex).toEqual(new RegExp('^bleh$|^bleh ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['bleh @user']);
    expect(command.reactionType).toBe('bleh');
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
    it('should match valid bleh commands', () => {
      expect(command.regex.test('bleh')).toBe(true);
      expect(command.regex.test('bleh @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('blehh')).toBe(false);
      expect(command.regex.test('bleh-ing')).toBe(false);
      expect(command.regex.test('ble')).toBe(false);
    });
  });
});
