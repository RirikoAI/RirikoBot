import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Playlist } from '#database/entities/playlist.entity';
import { EntityHelper } from '#util/entities/entity-helper';

/**
 * Track entity
 * @property {number} id - Track id
 * @property {string} name - Track name
 * @property {string} url - Track url
 * @property {Playlist} playlist - Playlist entity
 *
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class Track extends EntityHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  url: string;

  @ManyToOne(() => Playlist, (playlist) => playlist.tracks)
  playlist: Playlist;
}
