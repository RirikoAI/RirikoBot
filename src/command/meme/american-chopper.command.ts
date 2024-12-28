import { MemeBase } from '#command/meme/class/MemeBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

export default class AmericanChopperCommand extends MemeBase {
  name = 'american-chopper';
  regex = new RegExp('^american-chopper$', 'i');
  description = 'Generate american chopper meme';
  category = 'meme';
  usageExamples = ['american-chopper <text1> <text2>'];

  fileName = 'american_chopper_argument.jpg';

  textSettings = [
    { x: 320, y: 300, width: 550 },
    { x: 320, y: 690, width: 550 },
    { x: 320, y: 990, width: 550 },
    { x: 320, y: 1380, width: 550 },
    { x: 320, y: 1750, width: 550 },
  ];

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
  ];
}
