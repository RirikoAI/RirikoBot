import { Test, TestingModule } from '@nestjs/testing';
import PoutCommand from './pout.command';
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

describe('PoutCommand', () => {
  let command: PoutCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PoutCommand,
          useValue: new PoutCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<PoutCommand>(PoutCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('pout');
    expect(command.regex).toEqual(new RegExp('^pout$|^pout ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['pout @user']);
    expect(command.reactionType).toBe('pout');
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
    it('should match valid pout commands', () => {
      expect(command.regex.test('pout')).toBe(true);
      expect(command.regex.test('pout @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('pouts')).toBe(false);
      expect(command.regex.test('pouting')).toBe(false);
      expect(command.regex.test('pou')).toBe(false);
    });
  });
});
