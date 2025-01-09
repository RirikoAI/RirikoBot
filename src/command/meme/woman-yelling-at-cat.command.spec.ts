import { Test, TestingModule } from '@nestjs/testing';
import WomanYellingAtCatCommand from './woman-yelling-at-cat.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('WomanYellingAtCatCommand', () => {
  let command: WomanYellingAtCatCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: WomanYellingAtCatCommand,
          useValue: new WomanYellingAtCatCommand(jest.fn() as any),
        },
      ],
    }).compile();

    command = module.get<WomanYellingAtCatCommand>(WomanYellingAtCatCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('woman-yelling-at-cat');
    expect(command.regex).toEqual(new RegExp('^woman-yelling-at-cat$', 'i'));
    expect(command.description).toBe('Generate woman yelling at cat meme');
    expect(command.category).toBe('meme');
    expect(command.usageExamples).toEqual([
      'woman-yelling-at-cat <text1> <text2>',
    ]);
    expect(command.fileName).toBe('woman_yelling_at_cat.jpg');
    expect(command.textSettings).toEqual([
      { x: 300, y: 70, width: 400 },
      { x: 850, y: 70, width: 400 },
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
    it('should match valid woman-yelling-at-cat commands', () => {
      expect(command.regex.test('woman-yelling-at-cat')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('woman-yelling-at-cat meme')).toBe(false);
      expect(command.regex.test('cat-yelling-at-woman')).toBe(false);
    });
  });

  describe('textSettings behavior', () => {
    it('should have correct text settings for text1', () => {
      const text1Settings = command.textSettings[0];
      expect(text1Settings.x).toBe(300);
      expect(text1Settings.y).toBe(70);
      expect(text1Settings.width).toBe(400);
    });

    it('should have correct text settings for text2', () => {
      const text2Settings = command.textSettings[1];
      expect(text2Settings.x).toBe(850);
      expect(text2Settings.y).toBe(70);
      expect(text2Settings.width).toBe(400);
    });
  });
});
