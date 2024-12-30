import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class DroolCommand extends ReactBase {
  name = 'drool';
  regex = new RegExp('^drool$|^drool ', 'i');
  description =
    'Let your jaw drop and drool over someone who is just that amazing.';
  category = 'reactions';
  usageExamples = ['drool @user'];
  reactionType = 'drool';
  content = 'was left drooling over';
  noTargetContent =
    'stared into space, drooling over thoughts too good to handle';

  slashOptions = [
    {
      name: 'target',
      description: 'The person who has you totally awestruck and drooling.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
