import { MemeBase } from '#command/meme/class/MemeBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

export default class WomanYellingAtCatCommand extends MemeBase {
  name = 'woman-yelling-at-cat';
  regex = new RegExp('^woman-yelling-at-cat$', 'i');
  description = 'Generate woman yelling at cat meme';
  category = 'meme';
  usageExamples = ['woman-yelling-at-cat <text1> <text2>'];

  fileName = 'woman_yelling_at_cat.jpg';

  textSettings = [
    { x: 300, y: 70, width: 400 },
    { x: 850, y: 70, width: 400 },
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
