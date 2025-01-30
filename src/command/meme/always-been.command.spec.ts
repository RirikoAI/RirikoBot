import { Test, TestingModule } from '@nestjs/testing';
import AlwaysBeenCommand from './always-been.command';
import { SlashCommandOptionTypes } from '#command/command.types';

describe('AlwaysBeenCommand', () => {
  let command: AlwaysBeenCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: AlwaysBeenCommand,
          useValue: new AlwaysBeenCommand(jest.fn() as any),
        },
      ],
    }).compile();

    command = module.get<AlwaysBeenCommand>(AlwaysBeenCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('alwaysbeen');
    expect(command.regex).toEqual(new RegExp('^alwaysbeen$', 'i'));
    expect(command.description).toBe('Generate Always Has Been meme');
    expect(command.category).toBe('meme');
    expect(command.usageExamples).toEqual(['alwaysbeen <text1> <text2>']);
    expect(command.fileName).toBe('always_has_been.jpg');
    expect(command.textSettings).toEqual([
      { x: 480, y: 50, width: 550 },
      { x: 540, y: 490, width: 550 },
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
    it('should match valid alwaysbeen commands', () => {
      expect(command.regex.test('alwaysbeen')).toBe(true);
    });

    it('should not match invalid commands', () => {
      expect(command.regex.test('alwaysbeen meme')).toBe(false);
      expect(command.regex.test('beenalways')).toBe(false);
    });
  });

  describe('textSettings behavior', () => {
    it('should have correct text settings for text1', () => {
      const text1Settings = command.textSettings[0];
      expect(text1Settings.x).toBe(480);
      expect(text1Settings.y).toBe(50);
      expect(text1Settings.width).toBe(550);
    });

    it('should have correct text settings for text2', () => {
      const text2Settings = command.textSettings[1];
      expect(text2Settings.x).toBe(540);
      expect(text2Settings.y).toBe(490);
      expect(text2Settings.width).toBe(550);
    });
  });
});
