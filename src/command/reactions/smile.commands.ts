import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class SmileCommand extends ReactBase {
  name = 'smile';
  regex = new RegExp('^smile$|^smile ', 'i');
  description = 'Share a warm, cheerful smile with someone.';
  category = 'reactions';
  usageExamples = ['smile @user'];
  reactionType = 'smile';
  content = 'smiled warmly at';
  noTargetContent = 'smiled softly to themselves, letting their happiness brighten the room';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to share your cheerful smile with.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
