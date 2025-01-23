import { Test, TestingModule } from '@nestjs/testing';
import GettingPaidCommand from './getting-paid.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('GettingPaidCommand', () => {
  let command: GettingPaidCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: GettingPaidCommand,
          useValue: new GettingPaidCommand(jest.fn() as any),
        },
      ],
    }).compile();

    command = module.get<GettingPaidCommand>(GettingPaidCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('getting-paid');
    expect(command.regex).toEqual(new RegExp('^getting-paid$', 'i'));
    expect(command.description).toBe('Generate getting paid meme');
    expect(command.category).toBe('meme');
    expect(command.usageExamples).toEqual(['getting-paid <text1> <text2>']);
    expect(command.fileName).toBe('you_guys_are_getting_paid.jpg');
    expect(command.textSettings).toEqual([
      { x: 270, y: 50, width: 500 },
      { x: 270, y: 330, width: 500 },
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
    it('should match valid getting-paid commands', () => {
      expect(command.regex.test('getting-paid')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('getting-paid meme')).toBe(false);
      expect(command.regex.test('paidgetting')).toBe(false);
    });
  });

  describe('textSettings behavior', () => {
    it('should have correct text settings for text1', () => {
      const text1Settings = command.textSettings[0];
      expect(text1Settings.x).toBe(270);
      expect(text1Settings.y).toBe(50);
      expect(text1Settings.width).toBe(500);
    });

    it('should have correct text settings for text2', () => {
      const text2Settings = command.textSettings[1];
      expect(text2Settings.x).toBe(270);
      expect(text2Settings.y).toBe(330);
      expect(text2Settings.width).toBe(500);
    });
  });
});
