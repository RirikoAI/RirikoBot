import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class ThumbsUpCommand extends ReactBase {
  name = 'thumbsup';
  regex = new RegExp('^thumbsup$|^thumbsup ', 'i');
  description = 'Give someone an approving thumbs-up!';
  category = 'reactions';
  usageExamples = ['thumbsup @user'];
  reactionType = 'thumbsup';
  content = 'gave a confident thumbs-up to';
  noTargetContent =
    'raised a confident thumbs-up to the air, brimming with positivity';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to show approval or encouragement to.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
