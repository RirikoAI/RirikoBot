import {
  Column,
  CreateDateColumn,
  Entity, OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { Track } from "#database/entities/track.entity";

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
export class Playlist {
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
