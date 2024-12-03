import { Column, Entity, ManyToOne, PrimaryColumn } from 'typeorm';
import { Guild } from '#database/entities/guild.entity';

/**
 * MusicChannel Entity
 * @description A music channel entity that represents a music channel in a guild.
 * @property {string} id The ID of the music channel.
 * @property {string} name The name of the music channel.
 * @property {Guild} guild The guild that the music channel belongs to.
 */
@Entity()
export class MusicChannel {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @ManyToOne(() => Guild, (guild) => guild.musicChannels)
  guild: Guild;
}
