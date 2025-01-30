import { Test, TestingModule } from '@nestjs/testing';
import NosebleedCommand from './nosebleed.command';
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

describe('NosebleedCommand', () => {
  let command: NosebleedCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: NosebleedCommand,
          useValue: new NosebleedCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<NosebleedCommand>(NosebleedCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('nosebleed');
    expect(command.regex).toEqual(new RegExp('^nosebleed$|^nosebleed ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['nosebleed @user']);
    expect(command.reactionType).toBe('nosebleed');
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
    it('should match valid nosebleed commands', () => {
      expect(command.regex.test('nosebleed')).toBe(true);
      expect(command.regex.test('nosebleed @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('nosebleeds')).toBe(false);
      expect(command.regex.test('nosebleeding')).toBe(false);
      expect(command.regex.test('nose')).toBe(false);
    });
  });
});
