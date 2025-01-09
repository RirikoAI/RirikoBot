import { Test, TestingModule } from '@nestjs/testing';
import FacepalmCommand from './facepalm.command';
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

describe('FacepalmCommand', () => {
  let command: FacepalmCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: FacepalmCommand,
          useValue: new FacepalmCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<FacepalmCommand>(FacepalmCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('facepalm');
    expect(command.regex).toEqual(new RegExp('^facepalm$|^facepalm ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['facepalm @user']);
    expect(command.reactionType).toBe('facepalm');
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
    it('should match valid facepalm commands', () => {
      expect(command.regex.test('facepalm')).toBe(true);
      expect(command.regex.test('facepalm @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('facepalms')).toBe(false);
      expect(command.regex.test('facepalming')).toBe(false);
      expect(command.regex.test('facep')).toBe(false);
    });
  });
});
