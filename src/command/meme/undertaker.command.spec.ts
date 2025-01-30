import { Test, TestingModule } from '@nestjs/testing';
import UndertakerCommand from './undertaker.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('UndertakerCommand', () => {
  let command: UndertakerCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: UndertakerCommand,
          useValue: new UndertakerCommand(jest.fn() as any),
        },
      ],
    }).compile();

    command = module.get<UndertakerCommand>(UndertakerCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('undertaker');
    expect(command.regex).toEqual(new RegExp('^undertaker$', 'i'));
    expect(command.description).toBe('Generate undertaker meme');
    expect(command.category).toBe('meme');
    expect(command.usageExamples).toEqual(['undertaker <text1> <text2>']);
    expect(command.fileName).toBe('aj_styles___undertaker.jpg');
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
    it('should match valid undertaker commands', () => {
      expect(command.regex.test('undertaker')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('undertaker meme')).toBe(false);
      expect(command.regex.test('takerunder')).toBe(false);
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
