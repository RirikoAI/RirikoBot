import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class CelebrateCommand extends ReactBase {
  name = 'celebrate';
  regex = new RegExp('^celebrate$|^celebrate ', 'i');
  description = 'Throw confetti, pop the champagne, and celebrate with someone special!';
  category = 'reactions';
  usageExamples = ['celebrate @user'];
  reactionType = 'celebrate';
  content = 'threw a party and celebrated with';
  noTargetContent = 'threw a solo celebration, confetti and all, partying in their own awesome company';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to make a memorable celebration with.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
