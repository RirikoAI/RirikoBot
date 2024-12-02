import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class SurprisedCommand extends ReactBase {
  name = 'surprised';
  regex = new RegExp('^surprised$|^surprised ', 'i');
  description = 'Show your shock or astonishment toward someone.';
  category = 'reactions';
  usageExamples = ['surprised @user'];
  reactionType = 'surprised';
  content = 'looked completely surprised at';
  noTargetContent = 'gasped in astonishment, their face frozen in shock at the unexpected';

  slashOptions = [
    {
      name: 'target',
      description: 'The person who left you stunned or astonished.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
