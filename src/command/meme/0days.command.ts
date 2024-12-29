import { MemeBase } from '#command/meme/class/MemeBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

export default class ZeroDaysCommand extends MemeBase {
  name = '0days';
  regex = new RegExp('^0days$', 'i');
  description = 'Generate 0 days meme';
  category = 'meme';
  usageExamples = ['0days <text1> <text2>'];

  fileName = '0_days_without__lenny__simpsons_.jpg';

  textSettings = [
    { x: 430, y: 140, width: 300 },
    { x: 270, y: 340, width: 500 },
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
