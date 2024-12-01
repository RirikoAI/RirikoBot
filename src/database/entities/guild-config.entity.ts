import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Guild } from '#database/entities/guild.entity';

/**
 * GuildConfig Entity
 * @description The guild config entity represents a guild configuration in the database.
 * @property {string} id - The guild configuration ID.
 * @property {string} name - The guild configuration name.
 * @property {string} value - The guild configuration value.
 *
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class GuildConfig {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  value: string;

  @ManyToOne(() => Guild, (guild) => guild.configurations)
  guild: Guild;
}
