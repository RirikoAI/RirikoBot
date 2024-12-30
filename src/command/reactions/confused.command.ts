import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class ConfusedCommand extends ReactBase {
  name = 'confused';
  regex = new RegExp('^confused$|^confused ', 'i');
  description =
    'Tilt your head, scratch your chin, and show utter confusion toward someone.';
  category = 'reactions';
  usageExamples = ['confused @user'];
  reactionType = 'confused';
  content = 'gave a bewildered look to';
  noTargetContent = 'looked around with a puzzled expression';

  slashOptions = [
    {
      name: 'target',
      description: 'The person who has you scratching your head in confusion.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
