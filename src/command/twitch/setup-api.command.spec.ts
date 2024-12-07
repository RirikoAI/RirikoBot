import SetupApiCommand from './setup-api.command';
import { Logger } from '@nestjs/common';

describe('SetupApiCommand', () => {
  let command: SetupApiCommand;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      configRepository: {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      },
    };

    command = new SetupApiCommand(jest.fn() as any);
    command.db = mockDb;
  });

  it('should log an error if client-id or client-secret is missing', async () => {
    const loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation();

    await command.runCli('setup-twitch-api --client-id ');

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Client ID and Client Secret are required\n   Example: setup-twitch-api --client-id <client-id> --client-secret <client-secret>',
    );
  });

  it('should create a new config if none exists', async () => {
    mockDb.configRepository.findOne.mockResolvedValue(null);

    await command.runCli(
      'setup-twitch-api --client-id test-id --client-secret test-secret',
    );

    expect(mockDb.configRepository.create).toHaveBeenCalledWith({
      applicationId: process.env.DISCORD_APPLICATION_ID,
      twitchClientId: 'test-id',
      twitchClientSecret: 'test-secret',
    });
  });

  it('should update the config if it exists', async () => {
    const existingConfig = { twitchClientId: '', twitchClientSecret: '' };
    mockDb.configRepository.findOne.mockResolvedValue(existingConfig);

    await command.runCli(
      'setup-twitch-api --client-id test-id --client-secret test-secret',
    );

    expect(existingConfig.twitchClientId).toBe('test-id');
    expect(existingConfig.twitchClientSecret).toBe('test-secret');
    expect(mockDb.configRepository.save).toHaveBeenCalledWith(existingConfig);
  });

  it('should parse CLI arguments correctly', () => {
    const input =
      'setup-twitch-api --client-id test-id --client-secret test-secret';
    const args = command.parseCliArgs(input);

    expect(args['client-id']).toBe('test-id');
    expect(args['client-secret']).toBe('test-secret');
  });
});
