import { Injectable } from '@nestjs/common';
import { MusicAdapterInterface, PlayOptions } from '../music.adapter.interface';
import DisTube, { Queue } from 'distube';
import { YouTubePlugin } from '@distube/youtube';
import SpotifyPlugin from '@distube/spotify';
import SoundCloudPlugin from '@distube/soundcloud';
import DeezerPlugin from '@distube/deezer';
import { Client } from 'discord.js';

@Injectable()
export class DisTubeAdapter implements MusicAdapterInterface {
  voices: any;
  youtubePlugin: YouTubePlugin;
  distube: DisTube;
  
  constructor(discordClient: Client) {
    this.youtubePlugin = new YouTubePlugin();
    
    const plugins = [];
    
    plugins.push(
      new SpotifyPlugin(),
      new SoundCloudPlugin(),
      new DeezerPlugin(),
      new YouTubePlugin(),
    );
    
    this.distube = new DisTube(discordClient, {
      emitNewSongOnly: false,
      emitAddSongWhenCreatingQueue: false,
      emitAddListWhenCreatingQueue: false,
      plugins,
    });
    this.voices = this.distube.voices;
  }
  
  async createPlaylist(songs: any, options: any): Promise<any> {
    return await this.distube.createCustomPlaylist(songs, options);
  }
  
  async play(voiceChannel: any, query: string, options: PlayOptions): Promise<void> {
    await this.distube.play(voiceChannel, query, options);
  }
  
  async pause(guildId: string): Promise<void> {
    await this.distube.pause(guildId);
  }
  
  async resume(guildId: string): Promise<void> {
    await this.distube.resume(guildId);
  }
  
  async stop(guildId: string): Promise<void> {
    await this.distube.stop(guildId);
  }
  
  async skip(guildId: string): Promise<void> {
    const queue = this.distube.getQueue(guildId);
    if (queue) {
      await queue.skip();
    }
  }
  
  async setVolume(guildId: string, volume: number): Promise<void> {
    await this.distube.setVolume(guildId, volume);
  }
  
  async getVolume(guildId: string): Promise<number> {
    const queue = this.distube.getQueue(guildId);
    return queue?.volume;
  }
  
  async mute(guildId: string): Promise<void> {
    const queue = this.distube.getQueue(guildId);
    if (queue) {
      await this.distube.setVolume(guildId, 0);
    }
  }
  
  async unmute(guildId: string): Promise<void> {
    const queue = this.distube.getQueue(guildId);
    if (queue) {
      await this.distube.setVolume(guildId, 50); // Default volume
    }
  }
  
  async getQueue(guildId: string): Promise<Queue | null> {
    return this.distube.getQueue(guildId) || null;
  }
  
  async setRepeatMode(guildId: string, mode: number): Promise<void> {
    await this.distube.setRepeatMode(guildId, mode);
  }
  
  async getRepeatMode(guildId: string): Promise<number> {
    const queue = this.distube.getQueue(guildId);
    return queue?.repeatMode || 0;
  }
  
  async search(query: string): Promise<any> {
    const results = await this.youtubePlugin.search(query, {
      type: 'video',
      limit: 1,
      safeSearch: true,
    } as any);
    
    if (results.length === 0) {
      return;
    }
    return results;
  }
  
  on(event: any, handler: Function): void {
    this.distube.on(event, handler);
  }
  
  off(event: any, handler: Function): void {
    this.distube.off(event, handler);
  }
}