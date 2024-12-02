import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class PoutCommand extends ReactBase {
  name = 'pout';
  regex = new RegExp('^pout$|^pout ', 'i');
  description = 'Show your displeasure or sulk adorably at someone.';
  category = 'reactions';
  usageExamples = ['pout @user'];
  reactionType = 'pout';
  content = 'pouted adorably at';
  noTargetContent = 'pouted into the void, sulking adorably';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to sulk at in a cute way.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
