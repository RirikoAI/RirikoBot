import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class SweatCommand extends ReactBase {
  name = 'sweat';
  regex = new RegExp('^sweat$|^sweat ', 'i');
  description = 'Break into a nervous sweat while looking at someone.';
  category = 'reactions';
  usageExamples = ['sweat @user'];
  reactionType = 'sweat';
  content = 'started sweating nervously at';
  noTargetContent =
    'wiped their forehead nervously, beads of sweat forming under the pressure';

  slashOptions = [
    {
      name: 'target',
      description: 'The person making you sweat nervously.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
