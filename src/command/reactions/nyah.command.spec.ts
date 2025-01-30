import { Test, TestingModule } from '@nestjs/testing';
import NyahCommand from './nyah.command';
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

describe('NyahCommand', () => {
  let command: NyahCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: NyahCommand,
          useValue: new NyahCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<NyahCommand>(NyahCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('nyah');
    expect(command.regex).toEqual(new RegExp('^nyah$|^nyah ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['nyah @user']);
    expect(command.reactionType).toBe('nyah');
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
    it('should match valid nyah commands', () => {
      expect(command.regex.test('nyah')).toBe(true);
      expect(command.regex.test('nyah @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('nyahs')).toBe(false);
      expect(command.regex.test('nya')).toBe(false);
      expect(command.regex.test('ny')).toBe(false);
    });
  });
});
