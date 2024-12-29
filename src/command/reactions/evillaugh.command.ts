import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class EvilLaughCommand extends ReactBase {
  name = 'evillaugh';
  regex = new RegExp('^evillaugh$|^evillaugh ', 'i');
  description = 'Channel your inner villain and unleash a spine-chilling evil laugh.';
  category = 'reactions';
  usageExamples = ['evillaugh @user'];
  reactionType = 'evillaugh';
  content = 'unleashed a maniacal evil laugh at';
  noTargetContent = 'threw their head back and let out a dramatic "Mwahaha!" echoing into the void';

  slashOptions = [
    {
      name: 'target',
      description: 'The unfortunate soul who will be subjected to your villainous cackle.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
