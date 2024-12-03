import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class SleepCommand extends ReactBase {
  name = 'sleep';
  regex = new RegExp('^sleep$|^sleep ', 'i');
  description = 'Drift off into dreamland, maybe near someone for comfort.';
  category = 'reactions';
  usageExamples = ['sleep @user'];
  reactionType = 'sleep';
  content = 'fell asleep peacefully next to';
  noTargetContent = 'curled up in a cozy spot and drifted off into a peaceful slumber';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to sleep near for warmth and comfort.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
