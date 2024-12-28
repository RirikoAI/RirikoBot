import { MemeBase } from '#command/meme/class/MemeBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

export default class ChadCommand extends MemeBase {
  name = 'chad';
  regex = new RegExp('^chad$', 'i');
  description = 'Generate chad meme';
  category = 'meme';
  usageExamples = ['chad <text1> <text2>'];

  fileName = 'chad-meme.jpg';

  textSettings = [
    { x: 350, y: 850, width: 500 },
    { x: 1150, y: 850, width: 500 },
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
