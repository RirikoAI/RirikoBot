import { MusicPlayerAdapter } from './music-player.adapter';
import { Client } from 'discord.js';
import { Queue } from 'distube';

const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { DeezerPlugin } = require('@distube/deezer');
const { YouTubePlugin } = require('@distube/youtube');

/**
 * DisTube implementation of the MusicPlayerAdapter
 */
export class DisTubePlayerAdapter implements MusicPlayerAdapter {
  private distube: typeof DisTube;

  constructor(client: Client, options: any = {}) {
    const plugins = [];

    // Only add YouTubePlugin if DISABLE_YOUTUBE is not set to 'true'
    if (process.env.DISABLE_YOUTUBE !== 'true') {
      plugins.push(
        new YouTubePlugin({
          ytdlOptions: {
            searchSongs: false,
            searchPlaylist: false,
            searchResult: false,
            requestOptions: {
              dispatcher: {
                // Use youtubei.js for YouTube requests
                // @ts-ignore
                request: (url, options) => {
                  console.log('Requesting URL:', url);
                },
              },
            },
          },
        }),
      );
    }

    // Add other plugins
    plugins.push(
      new SpotifyPlugin(),
      new DeezerPlugin(),
      new SoundCloudPlugin(),
    );

    // Create DisTube instance with provided options and default settings
    this.distube = new DisTube(client, {
      emitNewSongOnly: false,
      emitAddSongWhenCreatingQueue: false,
      emitAddListWhenCreatingQueue: false,
      plugins,
      ...options,
    });
  }

  async play(voiceChannel: any, songString: string, options: any): Promise<void> {
    return this.distube.play(voiceChannel, songString, options);
  }

  async pause(guildId: string): Promise<void> {
    return this.distube.pause(guildId);
  }

  async resume(guildId: string): Promise<void> {
    return this.distube.resume(guildId);
  }

  async stop(guildId: string): Promise<void> {
    return this.distube.stop(guildId);
  }

  async setVolume(guildId: string, volume: number): Promise<void> {
    return this.distube.setVolume(guildId, volume);
  }

  getQueue(guildId: string): Queue | undefined {
    return this.distube.getQueue(guildId);
  }

  async setRepeatMode(guildId: string, mode: number): Promise<void> {
    return this.distube.setRepeatMode(guildId, mode);
  }

  async skip(guildId: string): Promise<void> {
    return this.distube.skip(guildId);
  }

  async createCustomPlaylist(songs: string[], options: any): Promise<any> {
    // DisTube doesn't have a direct method for creating custom playlists
    // We'll return an object that can be used with the play method
    return {
      songs,
      ...options.properties,
    };
  }

  on(event: string, callback: (...args: any[]) => void): this {
    this.distube.on(event, callback);
    return this;
  }

  /**
   * Register all event handlers at once
   * @param eventHandlers Object with event names as keys and handler functions as values
   */
  registerEvents(eventHandlers: Record<string, (...args: any[]) => void>): this {
    Object.entries(eventHandlers).forEach(([event, handler]) => {
      this.on(event, handler);
    });
    return this;
  }

  /**
   * Get the underlying DisTube instance
   * This should only be used for functionality not covered by the adapter
   */
  getDistubeInstance(): typeof DisTube {
    return this.distube;
  }
}
