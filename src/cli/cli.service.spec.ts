import { Test, TestingModule } from '@nestjs/testing';
import { CliService } from './cli.service';
import { CommandService } from '#command/command.service';
import * as readline from 'readline';

jest.mock('readline');

describe('CliService', () => {
  let service: CliService;
  let commandService: CommandService;
  let rlMock: jest.Mocked<readline.Interface>;

  beforeEach(async () => {
    rlMock = {
      on: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<readline.Interface>;

    (readline.createInterface as jest.Mock).mockReturnValue(rlMock);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CliService,
        {
          provide: CommandService,
          useValue: {
            checkCliCommand: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CliService>(CliService);
    commandService = module.get<CommandService>(CommandService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize readline interface', () => {
    expect(readline.createInterface).toHaveBeenCalledWith({
      input: process.stdin,
      output: process.stdout,
    });
  });

  it('should start and display welcome message', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const stdoutWriteSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation();

    await service.start();

    expect(consoleSpy).toHaveBeenCalledWith(
      '[Ririko CLI] Welcome. Please enter your command:',
    );
    expect(stdoutWriteSpy).toHaveBeenCalledWith('> ');

    consoleSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
  });

  it('should handle input and call commandService.checkCliCommand', async () => {
    const stdoutWriteSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation();
    const input = 'test command';

    await service['handleInput'](input);

    expect(commandService.checkCliCommand).toHaveBeenCalledWith(input);
    expect(stdoutWriteSpy).toHaveBeenCalledWith('> ');

    stdoutWriteSpy.mockRestore();
  });

  it('should exit on "exit" command', async () => {
    const loggerSpy = jest.spyOn(service['logger'], 'log').mockImplementation();
    const rlCloseSpy = jest.spyOn(rlMock, 'close').mockImplementation();
    const processExitSpy = jest.spyOn(process, 'exit').mockImplementation();

    await service['handleInput']('exit');

    expect(loggerSpy).toHaveBeenCalledWith('Goodbye!');
    expect(rlCloseSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(0);

    loggerSpy.mockRestore();
    rlCloseSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});
