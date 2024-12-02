import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class FacepalmCommand extends ReactBase {
  name = 'facepalm';
  regex = new RegExp('^facepalm$|^facepalm ', 'i');
  description = 'Plant your palm firmly on your face because someone left you speechless.';
  category = 'reactions';
  usageExamples = ['facepalm @user'];
  reactionType = 'facepalm';
  content = 'facepalmed dramatically at';
  noTargetContent = 'let out a sigh and facepalmed at their own thoughts, questioning everything';

  slashOptions = [
    {
      name: 'target',
      description: 'The person who made you reach peak exasperation.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
