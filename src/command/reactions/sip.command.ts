import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class SipCommand extends ReactBase {
  name = 'sip';
  regex = new RegExp('^sip$|^sip ', 'i');
  description = 'Take a calm sip of your drink, maybe while observing someone.';
  category = 'reactions';
  usageExamples = ['sip @user'];
  reactionType = 'sip';
  content = 'calmly sipped their drink while looking at';
  noTargetContent =
    'took a slow, contemplative sip of their drink, savoring the quiet moment';

  slashOptions = [
    {
      name: 'target',
      description:
        'The person you want to subtly observe while sipping your drink.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
