import { Injectable } from '@nestjs/common';
import { ReactBase } from './class/ReactBase.class';
import { SlashCommandOptionTypes } from '#command/command.types';

@Injectable()
export default class CoolCommand extends ReactBase {
  name = 'cool';
  regex = new RegExp('^cool$|^cool ', 'i');
  description = 'Put on your shades and show someone just how cool you are.';
  category = 'reactions';
  usageExamples = ['cool @user'];
  reactionType = 'cool';
  content = 'flashed their coolest moves at';
  noTargetContent = 'casually adjusted their shades and smirked at their own reflection';

  slashOptions = [
    {
      name: 'target',
      description: 'The person you want to dazzle with your unmatched coolness.',
      type: SlashCommandOptionTypes.User,
      required: false,
    },
  ];
}
