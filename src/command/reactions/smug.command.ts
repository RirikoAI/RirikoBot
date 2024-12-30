import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class SmugCommand extends ReactBase {
  name = 'smug';
  regex = new RegExp('^smug$|^smug ', 'i');
  description = 'Flash a confident, self-satisfied smug look at someone.';
  category = 'reactions';
  usageExamples = ['smug @user'];
  reactionType = 'smug';
  content = 'gave a smug look to';
  noTargetContent =
    'smirked confidently, feeling undeniably pleased with themselves';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to direct your smug expression toward.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
