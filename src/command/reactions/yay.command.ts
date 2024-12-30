import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class YayCommand extends ReactBase {
  name = 'yay';
  regex = new RegExp('^yay$|^yay ', 'i');
  description = 'Express excitement or joy with a cheerful "Yay!"';
  category = 'reactions';
  usageExamples = ['yay @user'];
  reactionType = 'yay';
  content = 'cheered excitedly at';
  noTargetContent =
    'threw their hands in the air and shouted "Yay!" with pure joy';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to share your excitement or joy with.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
