import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class PinchCommand extends ReactBase {
  name = 'pinch';
  regex = new RegExp('^pinch$|^pinch ', 'i');
  description = 'Give someone a playful pinch to grab their attention.';
  category = 'reactions';
  usageExamples = ['pinch @user'];
  reactionType = 'pinch';
  content = 'gave a pinch to';
  noTargetContent = 'pinched their own cheek to make sure they weren’t dreaming';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to give a cheeky pinch to.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
