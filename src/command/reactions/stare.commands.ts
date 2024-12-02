import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class StareCommand extends ReactBase {
  name = 'stare';
  regex = new RegExp('^stare$|^stare ', 'i');
  description = 'Fix your gaze on someone with intensity, curiosity, or confusion.';
  category = 'reactions';
  usageExamples = ['stare @user'];
  reactionType = 'stare';
  content = 'stared intently at';
  noTargetContent = 'fixed their gaze on the wall, lost in their own thoughts';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to fix your gaze upon.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
