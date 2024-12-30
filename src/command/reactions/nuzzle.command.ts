import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class NuzzleCommand extends ReactBase {
  name = 'nuzzle';
  regex = new RegExp('^nuzzle$|^nuzzle ', 'i');
  description = 'Snuggle up and gently nuzzle someone to show affection.';
  category = 'reactions';
  usageExamples = ['nuzzle @user'];
  reactionType = 'nuzzle';
  content = 'nuzzled up close to';
  noTargetContent =
    'curled up in a cozy spot and nuzzled into a soft blanket for comfort';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to nuzzle up to lovingly.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
