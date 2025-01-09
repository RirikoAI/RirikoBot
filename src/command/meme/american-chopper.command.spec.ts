import { Test, TestingModule } from '@nestjs/testing';
import AmericanChopperCommand from './american-chopper.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('AmericanChopperCommand', () => {
  let command: AmericanChopperCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: AmericanChopperCommand,
          useValue: new AmericanChopperCommand(jest.fn() as any),
        },
      ],
    }).compile();

    command = module.get<AmericanChopperCommand>(AmericanChopperCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('american-chopper');
    expect(command.regex).toEqual(new RegExp('^american-chopper$', 'i'));
    expect(command.description).toBe('Generate american chopper meme');
    expect(command.category).toBe('meme');
    expect(command.usageExamples).toEqual(['american-chopper <text1> <text2>']);
    expect(command.fileName).toBe('american_chopper_argument.jpg');
    expect(command.textSettings).toEqual([
      { x: 320, y: 300, width: 550 },
      { x: 320, y: 690, width: 550 },
      { x: 320, y: 990, width: 550 },
      { x: 320, y: 1380, width: 550 },
      { x: 320, y: 1750, width: 550 },
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
      {
        name: 'text3',
        description: 'Text 3',
        type: SlashCommandOptionTypes.String,
        required: false,
      },
      {
        name: 'text4',
        description: 'Text 4',
        type: SlashCommandOptionTypes.String,
        required: false,
      },
      {
        name: 'text5',
        description: 'Text 5',
        type: SlashCommandOptionTypes.String,
        required: false,
      },
    ]);
  });

  describe('regex behavior', () => {
    it('should match valid american-chopper commands', () => {
      expect(command.regex.test('american-chopper')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('american-chopper meme')).toBe(false);
      expect(command.regex.test('chopperamerican')).toBe(false);
    });
  });

  describe('textSettings behavior', () => {
    it('should have correct text settings for text1', () => {
      const text1Settings = command.textSettings[0];
      expect(text1Settings.x).toBe(320);
      expect(text1Settings.y).toBe(300);
      expect(text1Settings.width).toBe(550);
    });

    it('should have correct text settings for text2', () => {
      const text2Settings = command.textSettings[1];
      expect(text2Settings.x).toBe(320);
      expect(text2Settings.y).toBe(690);
      expect(text2Settings.width).toBe(550);
    });

    it('should have correct text settings for text3', () => {
      const text3Settings = command.textSettings[2];
      expect(text3Settings.x).toBe(320);
      expect(text3Settings.y).toBe(990);
      expect(text3Settings.width).toBe(550);
    });

    it('should have correct text settings for text4', () => {
      const text4Settings = command.textSettings[3];
      expect(text4Settings.x).toBe(320);
      expect(text4Settings.y).toBe(1380);
      expect(text4Settings.width).toBe(550);
    });

    it('should have correct text settings for text5', () => {
      const text5Settings = command.textSettings[4];
      expect(text5Settings.x).toBe(320);
      expect(text5Settings.y).toBe(1750);
      expect(text5Settings.width).toBe(550);
    });
  });
});
