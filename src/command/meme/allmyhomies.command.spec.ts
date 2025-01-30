import { Test, TestingModule } from '@nestjs/testing';
import AllmyhomiesCommand from './allmyhomies.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('AllmyhomiesCommand', () => {
  let command: AllmyhomiesCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: AllmyhomiesCommand,
          useValue: new AllmyhomiesCommand(jest.fn() as any),
        },
      ],
    }).compile();

    command = module.get<AllmyhomiesCommand>(AllmyhomiesCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('allmyhomies');
    expect(command.regex).toEqual(new RegExp('^allmyhomies$', 'i'));
    expect(command.description).toBe('Generate All My Homies Hate/Love X meme');
    expect(command.category).toBe('meme');
    expect(command.usageExamples).toEqual(['allmyhomies <text1> [text2]']);
    expect(command.fileName).toBe('all_my_homies_hate.jpg');
    expect(command.textSettings).toEqual([
      { x: 340, y: 50, width: 550 },
      { x: 340, y: 550, width: 550 },
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
    it('should match valid allmyhomies commands', () => {
      expect(command.regex.test('allmyhomies')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('allmyhomies meme')).toBe(false);
      expect(command.regex.test('homiesallmy')).toBe(false);
    });
  });

  describe('textSettings behavior', () => {
    it('should have correct text settings for text1', () => {
      const text1Settings = command.textSettings[0];
      expect(text1Settings.x).toBe(340);
      expect(text1Settings.y).toBe(50);
      expect(text1Settings.width).toBe(550);
    });

    it('should have correct text settings for text2', () => {
      const text2Settings = command.textSettings[1];
      expect(text2Settings.x).toBe(340);
      expect(text2Settings.y).toBe(550);
      expect(text2Settings.width).toBe(550);
    });
  });
});
