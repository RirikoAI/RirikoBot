// import PlayCommand from '#command/music/play.command';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { AvailableSharedServices } from '#command/command.module';

export const PostReplyActions = {
  play: async (
    action: any,
    message: DiscordMessage | DiscordInteraction,
    services: AvailableSharedServices,
  ) => {
    // await services.musicService.play(
    //   message.member.voice.channel,
    //   action.payload,
    //   // {
    //   //   member: message.member,
    //   //   textChannel: await (
    //   //     services.commandService.getCommand('play') as PlayCommand
    //   //   ).findMusicChannel(message),
    //   // },
    // );
  },
};
