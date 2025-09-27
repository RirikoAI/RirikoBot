export interface MusicAdapterInterface {
  // Player controls
  play(voiceChannel: any, query: string, options: PlayOptions): Promise<void>;
  pause(guildId: string): Promise<void>;
  resume(guildId: string): Promise<void>;
  stop(guildId: string): Promise<void>;
  skip(guildId: string): Promise<void>;

  // Volume controls
  setVolume(guildId: string, volume: number): Promise<void>;
  getVolume(guildId: string): Promise<number>;
  mute(guildId: string): Promise<void>;
  unmute(guildId: string): Promise<void>;

  // Queue management
  getQueue(guildId: string): Promise<any | null>;
  setRepeatMode(guildId: string, mode: number): Promise<void>;
  getRepeatMode(guildId: string): Promise<number>;

  // Search functionality
  search(params: any): Promise<SearchResult[]>;

  // Event handling
  on(event: string, handler: any): void;
  off(event: string, handler: any): void;

  voices: any;
  createPlaylist: any;
}

export interface PlayOptions {
  member: any;
  textChannel: any;
  message?: any;
  position?: number;
}

export interface SearchResult {
  id: string;
  name: string;
  url: string;
  thumbnail: string;
  duration: number;
  formattedDuration: string;
  uploader: { name: string; url: string };
  source: string;
}

export interface Queue {
  songs: any[];
  volume: number;
  paused: boolean;
  currentTime?: number;
  repeatMode: number;
  textChannel?: any;
  guild: { id: string };
}
