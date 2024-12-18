import { MemeBase } from '#command/meme/class/MemeBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

export default class AlwaysBeenCommand extends MemeBase {
  name = 'alwaysbeen';
  regex = new RegExp('^alwaysbeen$', 'i');
  description = 'Generate Always Has Been meme';
  category = 'meme';
  usageExamples = ['alwaysbeen <text1> <text2>'];

  fileName = 'always_has_been.jpg';

  textSettings = [
    { x: 960 / 2, y: 50, width: 550 },
    { x: 960 / 2 + 60, y: 490, width: 550 },
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
