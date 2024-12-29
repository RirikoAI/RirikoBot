import { MemeBase } from '#command/meme/class/MemeBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

export default class UndertakerCommand extends MemeBase {
  name = 'undertaker';
  regex = new RegExp('^undertaker$', 'i');
  description = 'Generate undertaker meme';
  category = 'meme';
  usageExamples = ['undertaker <text1> <text2>'];

  fileName = 'aj_styles___undertaker.jpg';

  textSettings = [
    { x: 200, y: 340, width: 300 },
    { x: 750, y: 140, width: 300 },
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
