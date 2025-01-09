import { Test, TestingModule } from '@nestjs/testing';
import NomCommand from './nom.command';
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

describe('NomCommand', () => {
  let command: NomCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: NomCommand,
          useValue: new NomCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<NomCommand>(NomCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('nom');
    expect(command.regex).toEqual(new RegExp('^nom$|^nom ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['nom @user']);
    expect(command.reactionType).toBe('nom');
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
    it('should match valid nom commands', () => {
      expect(command.regex.test('nom')).toBe(true);
      expect(command.regex.test('nom @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('noms')).toBe(false);
      expect(command.regex.test('nomnom')).toBe(false);
      expect(command.regex.test('no')).toBe(false);
    });
  });
});
