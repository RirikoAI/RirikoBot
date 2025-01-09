import { Test, TestingModule } from '@nestjs/testing';
import GotAnyMoreCommand from './got-any-more.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('GotAnyMoreCommand', () => {
  let command: GotAnyMoreCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: GotAnyMoreCommand,
          useValue: new GotAnyMoreCommand(jest.fn() as any),
        },
      ],
    }).compile();

    command = module.get<GotAnyMoreCommand>(GotAnyMoreCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('got-any-more');
    expect(command.regex).toEqual(new RegExp('^got-any-more$', 'i'));
    expect(command.description).toBe('Generate got any more meme');
    expect(command.category).toBe('meme');
    expect(command.usageExamples).toEqual(['got-any-more <text1> <text2>']);
    expect(command.fileName).toBe('y_all_got_any_more_of_that.jpg');
    expect(command.textSettings).toEqual([
      { x: 300, y: 50, width: 500 },
      { x: 300, y: 450, width: 500 },
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
    it('should match valid got-any-more commands', () => {
      expect(command.regex.test('got-any-more')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('got-any-more meme')).toBe(false);
      expect(command.regex.test('anymoregot')).toBe(false);
    });
  });

  describe('textSettings behavior', () => {
    it('should have correct text settings for text1', () => {
      const text1Settings = command.textSettings[0];
      expect(text1Settings.x).toBe(300);
      expect(text1Settings.y).toBe(50);
      expect(text1Settings.width).toBe(500);
    });

    it('should have correct text settings for text2', () => {
      const text2Settings = command.textSettings[1];
      expect(text2Settings.x).toBe(300);
      expect(text2Settings.y).toBe(450);
      expect(text2Settings.width).toBe(500);
    });
  });
});
