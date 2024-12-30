import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class PunchCommand extends ReactBase {
  name = 'punch';
  regex = new RegExp('^punch$|^punch ', 'i');
  description = 'Throw a punch at someone!';
  category = 'reactions';
  usageExamples = ['punch @user'];
  reactionType = 'punch';
  content = 'threw a punch at';
  noTargetContent =
    'swung a punch into the air, fighting imaginary foes with style';

  slashOptions = [
    {
      name: 'target',
      description:
        'The person you want to throw a punch at (hopefully playfully).',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
