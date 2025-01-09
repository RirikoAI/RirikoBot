import { Test, TestingModule } from '@nestjs/testing';
import ClapCommand from './clap.command';
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

describe('ClapCommand', () => {
  let command: ClapCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ClapCommand,
          useValue: new ClapCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<ClapCommand>(ClapCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('clap');
    expect(command.regex).toEqual(new RegExp('^clap$|^clap ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['clap @user']);
    expect(command.reactionType).toBe('clap');
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
    it('should match valid clap commands', () => {
      expect(command.regex.test('clap')).toBe(true);
      expect(command.regex.test('clap @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('claps')).toBe(false);
      expect(command.regex.test('clapping')).toBe(false);
      expect(command.regex.test('cla')).toBe(false);
    });
  });
});
