import { Test, TestingModule } from '@nestjs/testing';
import AirKissCommand from './airkiss.command';
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

describe('AirKissCommand', () => {
  let command: AirKissCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
              providers: [
                {
                  provide: AirKissCommand,
                  useValue: new AirKissCommand(mockSharedServices),
                },
              ],
            }).compile();

    command = module.get<AirKissCommand>(AirKissCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('airkiss');
    expect(command.regex).toEqual(new RegExp('^airkiss$|^airkiss ', 'i'));
    expect(command.description).toEqual(expect.any(String));
    expect(command.category).toBe('reactions');
    expect(command.usageExamples).toEqual(['airkiss @user']);
    expect(command.reactionType).toBe('airkiss');
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
    it('should match valid airkiss commands', () => {
      expect(command.regex.test('airkiss')).toBe(true);
      expect(command.regex.test('airkiss @user')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('airkisses')).toBe(false);
      expect(command.regex.test('airk')).toBe(false);
    });
  });
});
