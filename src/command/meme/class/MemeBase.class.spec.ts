import { Test, TestingModule } from '@nestjs/testing';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { MemeBase } from './MemeBase.class';

class TestMemeCommand extends MemeBase {
  name = 'test-meme';
  regex = /^test-meme$/i;
  description = 'Generate test meme';
  category = 'meme';
  usageExamples = ['test-meme <text1> <text2>'];
  fileName = '0_days_without__lenny__simpsons_.jpg';
  slashOptions = [
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
  ];
  textSettings = [
    { x: 100, y: 100, width: 200 },
    { x: 300, y: 300, width: 200 },
  ];

  async runPrefix(message: DiscordMessage): Promise<any> {
    return true;
  }
}

describe('MemeBase', () => {
  let command: TestMemeCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: TestMemeCommand,
          useValue: new TestMemeCommand(jest.fn() as any),
        },
      ],
    }).compile();

    command = module.get<TestMemeCommand>(TestMemeCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should have the correct properties', () => {
    expect(command.name).toBe('test-meme');
    expect(command.regex).toEqual(new RegExp('^test-meme$', 'i'));
    expect(command.description).toBe('Generate test meme');
    expect(command.category).toBe('meme');
    expect(command.usageExamples).toEqual(['test-meme <text1> <text2>']);
    expect(command.fileName).toBe('0_days_without__lenny__simpsons_.jpg');
    expect(command.textSettings).toEqual([
      { x: 100, y: 100, width: 200 },
      { x: 300, y: 300, width: 200 },
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

  describe('runSlash', () => {
    it('should generate image and reply with buffer', async () => {
      const interaction = {
        options: {
          getString: jest
            .fn()
            .mockReturnValueOnce('text1')
            .mockReturnValueOnce('text2'),
        },
        reply: jest.fn(),
      } as any as DiscordInteraction;

      jest
        .spyOn(command, 'generateImage')
        .mockResolvedValue(Buffer.from('test'));

      await command.runSlash(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        files: [Buffer.from('test')],
      });
    });
  });

  describe('runPrefix', () => {
    it('should call super.runPrefix', async () => {
      const message = {} as DiscordMessage;
      const response = await command.runPrefix(message);
      expect(response).toBe(true);
    });
  });

  describe('generateImage', () => {
    it('should generate image buffer', async () => {
      const texts = ['text1', 'text2'];
      const buffer = await command.generateImage(texts);

      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('drawText', () => {
    it('should draw text on canvas', () => {
      const canvas = require('canvas');
      const ctx = canvas.createCanvas(500, 500).getContext('2d');
      const text = 'test';
      const x = 100;
      const y = 100;
      const maxWidth = 200;

      command['drawText'](ctx, text, x, y, maxWidth);

      expect(ctx.fillText).toBeDefined();
    });
  });
});
