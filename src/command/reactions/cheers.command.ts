import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class CheersCommand extends ReactBase {
  name = 'cheers';
  regex = new RegExp('^cheers$|^cheers ', 'i');
  description = 'Raise your glass and share a toast with someone special!';
  category = 'reactions';
  usageExamples = ['cheers @user'];
  reactionType = 'cheers';
  content = 'raised a toast and clinked glasses with';
  noTargetContent =
    'raised a glass in celebration, toasting to themselves with a satisfied smile';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to share a celebratory toast with.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
