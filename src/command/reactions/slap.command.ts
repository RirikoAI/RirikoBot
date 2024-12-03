import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class SlapCommand extends ReactBase {
  name = 'slap';
  regex = new RegExp('^slap$|^slap ', 'i');
  description = 'Deliver a powerful slap to someone.';
  category = 'reactions';
  usageExamples = ['slap @user'];
  reactionType = 'slap';
  content = 'delivered a devastating slap to';
  noTargetContent = 'slapped the air, their hand stinging from the force of it';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to slap.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
