import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class SadCommand extends ReactBase {
  name = 'sad';
  regex = new RegExp('^sad$|^sad ', 'i');
  description = 'Express your sadness to someone.';
  category = 'reactions';
  usageExamples = ['sad @user'];
  reactionType = 'sad';
  content = 'looked sad while thinking about';
  noTargetContent = 'sat quietly with a heavy heart, lost in their own thoughts of sadness';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to share your sadness with.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
