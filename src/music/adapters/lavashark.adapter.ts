// lavashark-adapter.service.ts
import { Injectable } from '@nestjs/common';
import { MusicAdapterInterface, PlayOptions, SearchResult } from '../music.adapter.interface';
import { LavaShark } from 'lavashark';
import { Client } from 'discord.js';

@Injectable()
export class LavaSharkAdapter implements MusicAdapterInterface {
  public voices: any;
  public lavashark: LavaShark;
  discordClient: Client;
  
  constructor(discordClient: Client) {
    this.discordClient = discordClient;
    this.lavashark = new LavaShark({
      nodes: [
        {
          id: 'Node 1',
          hostname: 'localhost', // Replace with your Lavalink node hostname
          port: 2333, // Replace with your Lavalink node port
          password: 'youshallnotpass', // Replace with your Lavalink node password
        },
      ],
      sendWS: (guildId, payload) => {
        discordClient.guilds.cache.get(guildId)?.shard.send(payload);
      },
    });
    
    this.voices = this.lavashark.players;
    
    // Start LavaShark when client is ready
    discordClient.once('ready', () => {
      this.lavashark.start(discordClient.user.id);
    });
    
    // Required for voice state updates
    discordClient.on('raw', (packet) => this.lavashark.handleVoiceUpdate(packet));
  }
  
  async play(voiceChannel: any, query: string, options: PlayOptions): Promise<void> {
    const guildId = voiceChannel.guild.id;
    
    console.log(`Playing in guild ${ guildId } on channel ${ voiceChannel.id } with query: ${ query }`);
    const res = await this.lavashark.search(query);
    
    /**
     * search loadType: playlist, search, track, empty, error
     */
    
    if (res.loadType === "error") {
      console.log(`Search Error: ${res.exception.message}`);
      // return message.reply('❌ | Not found music.');
    }
    else if (res.loadType === "empty") {
      console.log(`Search Error: No matches (empty)`);
      // return message.reply('❌ | No matches.');
    }
    
    // Creates the audio player
    const player = this.lavashark.createPlayer({
      guildId: voiceChannel.guild.id,
      voiceChannelId: voiceChannel.id,
      textChannelId: voiceChannel.id,
      selfDeaf: true
    });
    
    console.log(res)
    
    try {
      await player.connect(); // Connects to the voice channel
    } catch (error) {
      console.log(error);
      return voiceChannel.reply({ content: `❌ | I can't join audio channel.`, allowedMentions: { repliedUser: false } });
    }
    
    if (res.loadType === 'playlist') {
      player.addTracks(res.tracks, voiceChannel.author);
      
      // voiceChannel.reply(`Playlist \`${res.playlistInfo.name}\` loaded!`);
    }
    else {
      const track = res.tracks[0];
      player.addTracks(res.tracks[0], voiceChannel.author);
      console.log('Added track', track);
      // options.textChannel.reply(`Added \`${track.title}\``);
    }
    
    if (!player.playing) await player.play();
  }
  
  async pause(guildId: string): Promise<void> {
    const player = this.lavashark.players.get(guildId);
    if (player) {
      await player.pause();
    }
  }
  
  async resume(guildId: string): Promise<void> {
    const player = this.lavashark.players.get(guildId);
    if (player) {
      await player.resume();
    }
  }
  
  async stop(guildId: string): Promise<void> {
    const player = this.lavashark.players.get(guildId);
    if (player) {
      player.destroy();
    }
  }
  
  async skip(guildId: string): Promise<void> {
    const player = this.lavashark.players.get(guildId);
    if (player) {
      await player.skip();
    }
  }
  
  async setVolume(guildId: string, volume: number): Promise<void> {
    this.lavashark.players.get(guildId)?.filters.setVolume(volume);
  }
  
  async getVolume(guildId: string): Promise<number> {
    const player = this.lavashark.players.get(guildId);
    return player?.volume ?? 100;
  }
  
  async mute(guildId: string): Promise<void> {
    await this.setVolume(guildId, 0);
  }
  
  async unmute(guildId: string): Promise<void> {
    await this.setVolume(guildId, 50); // Default volume
  }
  
  async getQueue(guildId: string): Promise<any | null> {
    const player = this.lavashark.players.get(guildId);
    if (!player) return null;
    
    return {
      songs: player.queue.tracks,
      volume: player.volume,
      paused: player.paused,
      currentTime: player.position,
      repeatMode: 0, // LavaShark handles repeat differently
      textChannel: { id: player.textChannelId },
      guild: { id: guildId },
    };
  }
  
  async setRepeatMode(guildId: string, mode: number): Promise<void> {
    const player = this.lavashark.players.get(guildId);
    if (player) {
      // LavaShark doesn't have built-in repeat modes like DisTube
      // You'll need to implement this logic manually
    }
  }
  
  async getRepeatMode(guildId: string): Promise<number> {
    const player = this.lavashark.players.get(guildId);
    console.log('Getting repeat mode for guild', guildId, player);
    return 0;
  }
  
  async search(query: string): Promise<SearchResult[]> {
    const res = await this.lavashark.search(query);
    
    if (res.loadType !== 'track' && res.loadType !== 'search') {
      return [];
    }
    
    return res.tracks.map(track => ({
      id: track.source,
      name: track.title,
      url: track.uri,
      thumbnail: '',
      duration: track.duration.value,
      formattedDuration: this.formatDuration(track.duration.value),
      uploader: { name: track.author, url: '' },
      source: 'youtube',
    }));
  }
  
  on(event: any, handler: Function): void {
    this.lavashark.on('trackStart', (player, track) => {
      // const channel: any = this.discordClient.channels.cache.get(player.textChannelId);
      // channel.send(`Now playing \`${ track.title }\``);
    });
    
    // Fired when the queue ends
    this.lavashark.on('queueEnd', (player) => {
      // const channel: any = this.discordClient.channels.cache.get(player.textChannelId);
      // channel.send(`Queue ended`);
      player.destroy();
    });
    
    // This event is needed to catch any errors that occur on LavaShark
    this.lavashark.on('error', (node, err) => {
      console.error('[LavaShark]', `Error on node ${ node.identifier }`, err.message);
    });
    // this.lavashark.on(event, handler);
  }
  
  off(event: any, handler: any): void {
    this.lavashark.off(event, handler);
  }
  
  async createPlaylist(songs: any, options: any): Promise<any> {
    // LavaShark doesn't have built-in playlist creation like DisTube
    // You'll need to implement this manually
    throw new Error('createPlaylist not implemented for LavaShark');
  }
  
  private formatDuration(duration: number): string {
    const minutes = Math.floor(duration / 60000);
    const seconds = ((duration % 60000) / 1000).toFixed(0);
    return `${ minutes }:${ seconds.padStart(2, '0') }`;
  }
}