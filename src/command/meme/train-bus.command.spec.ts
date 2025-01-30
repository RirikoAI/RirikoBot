import { Test, TestingModule } from '@nestjs/testing';
import TrainBusCommand from './train-bus.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('TrainBusCommand', () => {
  let command: TrainBusCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: TrainBusCommand,
          useValue: new TrainBusCommand(jest.fn() as any),
        },
      ],
    }).compile();

    command = module.get<TrainBusCommand>(TrainBusCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('train-bus');
    expect(command.regex).toEqual(new RegExp('^train-bus$', 'i'));
    expect(command.description).toBe('Generate train hitting bus meme');
    expect(command.category).toBe('meme');
    expect(command.usageExamples).toEqual(['undertaker <text1> <text2>']);
    expect(command.fileName).toBe('a_train_hitting_a_school_bus.jpg');
    expect(command.textSettings).toEqual([
      { x: 200, y: 340, width: 300 },
      { x: 750, y: 140, width: 300 },
    ]);
  });

  it('should define correct slash command options', () => {
    expect(command.slashOptions).toEqual([
      {
        name: 'text1',
        description: 'Text 1',
        type: SlashCommandOptionTypes.String,
        required: true,
      },
      {
        name: 'text2',
        description: 'Text 2',
        type: SlashCommandOptionTypes.String,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid train-bus commands', () => {
      expect(command.regex.test('train-bus')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('train-bus meme')).toBe(false);
      expect(command.regex.test('bustrain')).toBe(false);
    });
  });

  describe('textSettings behavior', () => {
    it('should have correct text settings for text1', () => {
      const text1Settings = command.textSettings[0];
      expect(text1Settings.x).toBe(200);
      expect(text1Settings.y).toBe(340);
      expect(text1Settings.width).toBe(300);
    });

    it('should have correct text settings for text2', () => {
      const text2Settings = command.textSettings[1];
      expect(text2Settings.x).toBe(750);
      expect(text2Settings.y).toBe(140);
      expect(text2Settings.width).toBe(300);
    });
  });
});
