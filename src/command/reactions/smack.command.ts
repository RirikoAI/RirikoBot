import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class SmackCommand extends ReactBase {
  name = 'smack';
  regex = new RegExp('^smack$|^smack ', 'i');
  description = 'Give someone a frustrated smack.';
  category = 'reactions';
  usageExamples = ['smack @user'];
  reactionType = 'smack';
  content = 'smacked';
  noTargetContent = 'smacked their own forehead, muttering under their breath';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to angrily smack.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
