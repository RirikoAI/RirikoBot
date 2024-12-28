import { MemeBase } from '#command/meme/class/MemeBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

export default class GettingPaidCommand extends MemeBase {
  name = 'getting-paid';
  regex = new RegExp('^getting-paid$', 'i');
  description = 'Generate getting paid meme';
  category = 'meme';
  usageExamples = ['getting-paid <text1> <text2>'];

  fileName = 'you_guys_are_getting_paid.jpg';

  textSettings = [
    { x: 270, y: 50, width: 500 },
    { x: 270, y: 330, width: 500 },
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
