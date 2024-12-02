import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class ShoutCommand extends ReactBase {
  name = 'shout';
  regex = new RegExp('^shout$|^shout ', 'i');
  description = 'Raise your voice and shout at someone, whether in excitement or frustration!';
  category = 'reactions';
  usageExamples = ['shout @user'];
  reactionType = 'shout';
  content = 'shouted loudly at';
  noTargetContent = 'let out a loud shout into the void, their voice echoing like thunder';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to shout at.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
