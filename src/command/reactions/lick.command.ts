import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class LickCommand extends ReactBase {
  name = 'lick';
  regex = new RegExp('^lick$|^lick ', 'i');
  description = 'Lick someone, because why not?';
  category = 'reactions';
  usageExamples = ['lick @user'];
  reactionType = 'lick';
  content = 'gave a lick to';
  noTargetContent = 'stuck out their tongue and licked the air, just for fun';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to give a lick to.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
