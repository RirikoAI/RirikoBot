import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Playlist } from "#database/entities/playlist.entity";

/**
 * Voice Channel Entity
 * @description The voice channel entity represents a voice channel in the database.
 * @property {string} channelId - The channel ID.
 * @property {string} name - The channel name.
 * @property {string} guildId - The guild ID.
 *
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class Track {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Column()
  name: string;
  
  @Column()
  url: string;

  @ManyToOne(() => Playlist, (playlist) => playlist.tracks)
  playlist: Playlist;
}
