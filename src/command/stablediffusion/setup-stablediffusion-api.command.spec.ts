import SetupStableDiffusionApiCommand from './setup-stablediffusion-api.command';

describe('SetupStableDiffusionApiCommand', () => {
  let setupCommand: SetupStableDiffusionApiCommand;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      configRepository: {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      },
    };
    setupCommand = new SetupStableDiffusionApiCommand(jest.fn() as any);
    setupCommand.db = mockDb;
  });

  it('should log an error if no API token is provided', async () => {
    console.error = jest.fn();
    await setupCommand.runCli('');
    expect(console.error).toHaveBeenCalledWith(
      'API Token is required\n   Example: setup-stablediffusion-api --api-token <api-token>',
    );
  });

  it('should create a new configuration if none exists', async () => {
    mockDb.configRepository.findOne.mockResolvedValue(null);
    await setupCommand.runCli('--api-token test-token');
    expect(mockDb.configRepository.create).toHaveBeenCalledWith({
      applicationId: process.env.DISCORD_APPLICATION_ID,
      stableDiffusionApiToken: 'test-token',
    });
  });

  it('should update the existing configuration if it exists', async () => {
    const existingConfig = { stableDiffusionApiToken: 'old-token' };
    mockDb.configRepository.findOne.mockResolvedValue(existingConfig);
    await setupCommand.runCli('--api-token new-token');
    expect(existingConfig.stableDiffusionApiToken).toBe('new-token');
    expect(mockDb.configRepository.save).toHaveBeenCalledWith(existingConfig);
  });

  it('should parse CLI arguments correctly', () => {
    const args = setupCommand.parseCliArgs('--api-token test-token');
    expect(args).toEqual({ 'api-token': 'test-token' });
  });
});
