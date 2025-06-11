import { Queue } from 'distube';

/**
 * Interface for music player adapters
 * This allows different music player implementations to be used interchangeably
 */
export interface MusicPlayerAdapter {
  /**
   * Play a song in a voice channel
   */
  play(voiceChannel: any, songString: string, options: any): Promise<void>;

  /**
   * Pause the current playback
   */
  pause(guildId: string): Promise<void>;

  /**
   * Resume the current playback
   */
  resume(guildId: string): Promise<void>;

  /**
   * Stop the current playback
   */
  stop(guildId: string): Promise<void>;

  /**
   * Set the volume of the player
   */
  setVolume(guildId: string, volume: number): Promise<void>;

  /**
   * Get the queue for a guild
   */
  getQueue(guildId: string): Queue | undefined;

  /**
   * Set the repeat mode for a guild
   */
  setRepeatMode(guildId: string, mode: number): Promise<void>;

  /**
   * Skip the current song
   */
  skip(guildId: string): Promise<void>;

  /**
   * Create a custom playlist from a list of songs
   */
  createCustomPlaylist?(songs: string[], options: any): Promise<any>;

  /**
   * Register event handlers for the player
   */
  on(event: string, callback: (...args: any[]) => void): this;

  /**
   * Search for songs
   */
  search?(params: { query: string }): Promise<any>;
}
