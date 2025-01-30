import { Test, TestingModule } from '@nestjs/testing';
import { SlashCommandOptionTypes } from '#command/command.types';
import ZeroDaysCommand from '#command/meme/0days.command';

describe('ZeroDaysCommand', () => {
  let command: ZeroDaysCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ZeroDaysCommand,
          useValue: new ZeroDaysCommand(jest.fn() as any),
        },
      ],
    }).compile();

    command = module.get<ZeroDaysCommand>(ZeroDaysCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('0days');
    expect(command.regex).toEqual(new RegExp('^0days$', 'i'));
    expect(command.description).toBe('Generate 0 days meme');
    expect(command.category).toBe('meme');
    expect(command.usageExamples).toEqual(['0days <text1> <text2>']);
    expect(command.fileName).toBe('0_days_without__lenny__simpsons_.jpg');
    expect(command.textSettings).toEqual([
      { x: 430, y: 140, width: 300 },
      { x: 270, y: 340, width: 500 },
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
    it('should match valid 0days commands', () => {
      expect(command.regex.test('0days')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('0days meme')).toBe(false);
      expect(command.regex.test('days0')).toBe(false);
    });
  });

  describe('textSettings behavior', () => {
    it('should have correct text settings for text1', () => {
      const text1Settings = command.textSettings[0];
      expect(text1Settings.x).toBe(430);
      expect(text1Settings.y).toBe(140);
      expect(text1Settings.width).toBe(300);
    });

    it('should have correct text settings for text2', () => {
      const text2Settings = command.textSettings[1];
      expect(text2Settings.x).toBe(270);
      expect(text2Settings.y).toBe(340);
      expect(text2Settings.width).toBe(500);
    });
  });
});
