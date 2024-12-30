import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class BlehCommand extends ReactBase {
  name = 'bleh';
  regex = new RegExp('^bleh$|^bleh ', 'i');
  description = 'Make a bleh expression.';
  category = 'reactions';
  usageExamples = ['bleh @user'];
  reactionType = 'bleh';
  content = 'made a bleh expression at';
  noTargetContent = 'stuck out their tongue and made a bleh expression';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to make a bleh expression at',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
