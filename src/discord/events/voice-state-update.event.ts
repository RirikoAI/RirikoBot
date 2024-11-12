import { Client, Events } from 'discord.js';
import { AvcService } from '#avc/avc.service';

/**
 * VoiceStateUpdateEvent event
 * @author Earnest Angel (https://angel.net.my)
 * @param client
 * @param avcService
 * @constructor
 */
export const VoiceStateUpdateEvent = (
  client: Client,
  avcService: AvcService,
) => {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    await avcService.check(oldState, newState);
  });
};
