import { LavalinkManager } from 'lavalink-client';
import { Client } from 'discord.js';
import { MusicPlayerAdapter } from './music-player.adapter';

export class LavaLinkPlayerAdapter implements MusicPlayerAdapter {
  private manager: LavalinkManager;

  constructor(client: Client, options: { nodes: any[] }) {
    this.manager = new LavalinkManager({
      nodes: options.nodes,
      sendToShard: (guildId, payload) =>
        client.guilds.cache.get(guildId)?.shard?.send(payload),
    });

    client.on('ready', async () => {
      await this.manager.init({
        id: client.user!.id,
        username: client.user!.username,
      });
    });

    client.on('raw', (d) => this.manager.sendRawData(d));
  }

  async play(
    voiceChannel: any,
    songString: string,
    options: any,
  ): Promise<void> {
    const guildId = voiceChannel.guild.id;
    const channelId = voiceChannel.id;

    let player = this.manager.getPlayer(guildId);
    if (!player) {
      player = this.manager.createPlayer({
        guildId,
        voiceChannelId: channelId,
        textChannelId: options.textChannel?.id,
        selfDeaf: true,
      });
      await player.connect();
    }

    const res = await player.search(
      { query: songString, source: options.source || 'youtube' },
      options.requester,
    );
    if (!res.tracks.length) throw new Error('No tracks found');

    await player.queue.add(res.tracks[0]);
    if (!player.playing) await player.play();
  }

  async pause(guildId: string): Promise<void> {
    const player = this.manager.getPlayer(guildId);
    if (player) player.pause();
  }

  async resume(guildId: string): Promise<void> {
    const player = this.manager.getPlayer(guildId);
    if (player) player.play();
  }

  async stop(guildId: string): Promise<void> {
    const player = this.manager.getPlayer(guildId);
    if (player) {
      await player.stopPlaying();
      await player.disconnect();
      this.manager.deletePlayer(guildId);
    }
  }

  async setVolume(guildId: string, volume: number): Promise<void> {
    const player = this.manager.getPlayer(guildId);
    if (player) player.setVolume(volume);
  }

  getQueue(guildId: string): any {
    console.error('getQueue is not implemented in LavaLinkPlayerAdapter');
    return {};
  }

  async setRepeatMode(guildId: string, mode: number): Promise<void> {
    const player = this.manager.getPlayer(guildId);
    if (player) player.setRepeatMode('track');
  }

  async skip(guildId: string): Promise<void> {
    const player = this.manager.getPlayer(guildId);
    if (player) await player.skip();
  }

  createCustomPlaylist?(songs: string[], options: any): Promise<any> {
    return Promise.resolve({ songs, properties: options.properties });
  }

  search?(params: { query: string }): any {
    console.error('getQueue is not implemented in LavaLinkPlayerAdapter');
    return {};
  }

  on(event: string, callback: (...args: any[]) => void): this {
    // Map manager events to generic events
    // e.g. 'trackStart' maps to trackStart
    (this.manager as any).on(event, callback);
    return this;
  }
}
