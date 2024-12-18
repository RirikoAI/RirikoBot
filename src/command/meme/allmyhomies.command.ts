import { MemeBase } from '#command/meme/class/MemeBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

export default class AllmyhomiesCommand extends MemeBase {
  name = 'allmyhomies';
  regex = new RegExp('^allmyhomies$', 'i');
  description = 'Generate All My Homies Hate/Love X meme';
  category = 'meme';
  usageExamples = ['allmyhomies <text1> [text2]'];

  fileName = 'all_my_homies_hate.jpg';

  textSettings = [
    { x: 340, y: 50, width: 550 },
    { x: 340, y: 550, width: 550 },
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
