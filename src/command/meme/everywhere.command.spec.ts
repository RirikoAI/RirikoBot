import { Test, TestingModule } from '@nestjs/testing';
import EverywhereCommand from './everywhere.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('EverywhereCommand', () => {
  let command: EverywhereCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: EverywhereCommand,
          useValue: new EverywhereCommand(jest.fn() as any),
        },
      ],
    }).compile();

    command = module.get<EverywhereCommand>(EverywhereCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('everywhere');
    expect(command.regex).toEqual(new RegExp('^everywhere$', 'i'));
    expect(command.description).toBe('Generate everywhere meme');
    expect(command.category).toBe('meme');
    expect(command.usageExamples).toEqual(['everywhere <text1> <text2>']);
    expect(command.fileName).toBe('x__x_everywhere.jpg');
    expect(command.textSettings).toEqual([
      { x: 400, y: 50, width: 500 },
      { x: 400, y: 500, width: 500 },
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
    it('should match valid everywhere commands', () => {
      expect(command.regex.test('everywhere')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('everywhere meme')).toBe(false);
      expect(command.regex.test('whereevery')).toBe(false);
    });
  });

  describe('textSettings behavior', () => {
    it('should have correct text settings for text1', () => {
      const text1Settings = command.textSettings[0];
      expect(text1Settings.x).toBe(400);
      expect(text1Settings.y).toBe(50);
      expect(text1Settings.width).toBe(500);
    });

    it('should have correct text settings for text2', () => {
      const text2Settings = command.textSettings[1];
      expect(text2Settings.x).toBe(400);
      expect(text2Settings.y).toBe(500);
      expect(text2Settings.width).toBe(500);
    });
  });
});
