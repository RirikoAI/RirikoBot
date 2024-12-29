import { MemeBase } from '#command/meme/class/MemeBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

export default class GotAnyMoreCommand extends MemeBase {
  name = 'got-any-more';
  regex = new RegExp('^got-any-more$', 'i');
  description = 'Generate got any more meme';
  category = 'meme';
  usageExamples = ['got-any-more <text1> <text2>'];

  fileName = 'y_all_got_any_more_of_that.jpg';

  textSettings = [
    { x: 300, y: 50, width: 500 },
    { x: 300, y: 450, width: 500 },
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
