import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class SorryCommand extends ReactBase {
  name = 'sorry';
  regex = new RegExp('^sorry$|^sorry ', 'i');
  description = 'Apologize sincerely or sheepishly to someone.';
  category = 'reactions';
  usageExamples = ['sorry @user'];
  reactionType = 'sorry';
  content = 'apologized sincerely to';
  noTargetContent =
    'looked down apologetically, muttering a heartfelt "I’m sorry"';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to say sorry to.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
