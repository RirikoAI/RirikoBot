import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class NervousCommand extends ReactBase {
  name = 'nervous';
  regex = new RegExp('^nervous$|^nervous ', 'i');
  description = 'Fidget awkwardly and show your nervousness around someone.';
  category = 'reactions';
  usageExamples = ['nervous @user'];
  reactionType = 'nervous';
  content = 'looked nervously at';
  noTargetContent = 'fidgeted awkwardly, glancing around with a nervous smile';

  slashOptions = [
    {
      name: 'target',
      description:
        'The person that is making you feel all fidgety and anxious.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
