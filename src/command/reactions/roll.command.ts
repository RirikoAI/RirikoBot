import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class RollCommand extends ReactBase {
  name = 'roll';
  regex = new RegExp('^roll$|^roll ', 'i');
  description = 'Roll around playfully or dramatically near someone.';
  category = 'reactions';
  usageExamples = ['roll @user'];
  reactionType = 'roll';
  content = 'rolled around near';
  noTargetContent = 'rolled around on the floor dramatically, as if life were just too much';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to roll around near.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
