import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class SlowClapCommand extends ReactBase {
  name = 'slowclap';
  regex = new RegExp('^slowclap$|^slowclap ', 'i');
  description = 'Deliver a slow, sarcastic clap to someone.';
  category = 'reactions';
  usageExamples = ['slowclap @user'];
  reactionType = 'slowclap';
  content = 'gave a slow, sarcastic clap to';
  noTargetContent = 'clapped slowly and sarcastically, their eyes filled with mock amusement';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to direct your slow, sarcastic applause at.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
