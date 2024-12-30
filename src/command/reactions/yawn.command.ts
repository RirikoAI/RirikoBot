import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class YawnCommand extends ReactBase {
  name = 'yawn';
  regex = new RegExp('^yawn$|^yawn ', 'i');
  description = 'Let out a big yawn, showing how tired or bored you are.';
  category = 'reactions';
  usageExamples = ['yawn @user'];
  reactionType = 'yawn';
  content = 'yawned sleepily at';
  noTargetContent =
    'stretched their arms and let out a long, exaggerated yawn, barely staying awake';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to show your tired or bored state to.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
