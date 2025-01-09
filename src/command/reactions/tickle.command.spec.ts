import { Test, TestingModule } from '@nestjs/testing';
import TickleCommand from './tickle.command';
import { SlashCommandOptionTypes } from '#command/command.types';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { SharedServicesMock, TestSharedService } from '../../../test/mocks/shared-services.mock';

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

describe('TickleCommand', () => {
  let command: TickleCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: TickleCommand,
          useValue: new TickleCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<TickleCommand>(TickleCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('tickle');
    expect(command.regex).toEqual(new RegExp('^tickle$|^tickle ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['tickle @user']);
    expect(command.reactionType).toBe('tickle');
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
    it('should match valid tickle commands', () => {
      expect(command.regex.test('tickle')).toBe(true);
      expect(command.regex.test('tickle @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('tickles')).toBe(false);
      expect(command.regex.test('tickling')).toBe(false);
      expect(command.regex.test('tick')).toBe(false);
    });
  });
});
