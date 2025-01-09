import { Test, TestingModule } from '@nestjs/testing';
import ChadCommand from './chad.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('ChadCommand', () => {
  let command: ChadCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ChadCommand,
          useValue: new ChadCommand(jest.fn() as any),
        },
      ],
    }).compile();

    command = module.get<ChadCommand>(ChadCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('chad');
    expect(command.regex).toEqual(new RegExp('^chad$', 'i'));
    expect(command.description).toBe('Generate chad meme');
    expect(command.category).toBe('meme');
    expect(command.usageExamples).toEqual(['chad <text1> <text2>']);
    expect(command.fileName).toBe('chad-meme.jpg');
    expect(command.textSettings).toEqual([
      { x: 350, y: 850, width: 500 },
      { x: 1150, y: 850, width: 500 },
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
    it('should match valid chad commands', () => {
      expect(command.regex.test('chad')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('chad meme')).toBe(false);
      expect(command.regex.test('memechad')).toBe(false);
    });
  });

  describe('textSettings behavior', () => {
    it('should have correct text settings for text1', () => {
      const text1Settings = command.textSettings[0];
      expect(text1Settings.x).toBe(350);
      expect(text1Settings.y).toBe(850);
      expect(text1Settings.width).toBe(500);
    });

    it('should have correct text settings for text2', () => {
      const text2Settings = command.textSettings[1];
      expect(text2Settings.x).toBe(1150);
      expect(text2Settings.y).toBe(850);
      expect(text2Settings.width).toBe(500);
    });
  });
});
