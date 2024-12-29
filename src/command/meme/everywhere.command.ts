import { MemeBase } from '#command/meme/class/MemeBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

export default class EverywhereCommand extends MemeBase {
  name = 'everywhere';
  regex = new RegExp(`^everywhere$`, 'i');
  description = 'Generate everywhere meme';
  category = 'meme';
  usageExamples = ['everywhere <text1> <text2>'];

  fileName = 'x__x_everywhere.jpg';

  textSettings = [
    { x: 400, y: 50, width: 500 },
    { x: 400, y: 500, width: 500 },
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
  ];
}
