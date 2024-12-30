import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Track } from '#database/entities/track.entity';
import { EntityHelper } from '#util/entities/entity-helper';

/**
 * Playlist entity
 * @description The playlist entity represents a playlist in the database.
 * @property {number} id - The playlist ID.
 * @property {string} name - The playlist name.
 * @property {string} userId - The user ID.
 * @property {string} author - The playlist author.
 * @property {string} authorTag - The playlist author tag.
 * @property {boolean} public - The playlist public status.
 * @property {number} plays - The playlist plays.
 * @property {Date} createdAt - The playlist created date.
 * @property {Date} updatedAt - The playlist updated date.
 * @property {Track[]} tracks - The playlist tracks.
 *
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class Playlist extends EntityHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  userId?: string;

  @Column()
  author?: string;

  @Column()
  authorTag?: string;

  @Column()
  public?: boolean;

  @Column()
  plays?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Track, (track) => track.playlist, {
    eager: true,
  })
  tracks: Track[];
}
