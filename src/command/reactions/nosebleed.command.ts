import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class NosebleedCommand extends ReactBase {
  name = 'nosebleed';
  regex = new RegExp('^nosebleed$|^nosebleed ', 'i');
  description = 'React with a dramatic nosebleed, overwhelmed by someone.';
  category = 'reactions';
  usageExamples = ['nosebleed @user'];
  reactionType = 'nosebleed';
  content = 'had a nosebleed because of';
  noTargetContent =
    'felt their face heat up and had a sudden, dramatic nosebleed';

  slashOptions = [
    {
      name: 'target',
      description: 'The person that left you nosebleeding.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
