import { Test, TestingModule } from '@nestjs/testing';
import CryCommand from './cry.command';
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

describe('CryCommand', () => {
  let command: CryCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CryCommand,
          useValue: new CryCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<CryCommand>(CryCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('cry');
    expect(command.regex).toEqual(new RegExp('^cry$|^cry ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['cry @user']);
    expect(command.reactionType).toBe('cry');
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
    it('should match valid cry commands', () => {
      expect(command.regex.test('cry')).toBe(true);
      expect(command.regex.test('cry @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('cries')).toBe(false);
      expect(command.regex.test('crying')).toBe(false);
      expect(command.regex.test('cri')).toBe(false);
    });
  });
});
