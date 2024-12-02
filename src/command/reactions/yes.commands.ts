import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class YesCommand extends ReactBase {
  name = 'yes';
  regex = new RegExp('^yes$|^yes ', 'i');
  description = 'Express your agreement or excitement with a resounding yes!';
  category = 'reactions';
  usageExamples = ['yes @user'];
  reactionType = 'yes';
  content = 'enthusiastically said yes to';
  noTargetContent = 'pumped their fist in the air and shouted "Yes!" with boundless enthusiasm';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to agree with.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
