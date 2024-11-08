import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Guild Entity
 * @description The guild entity represents a guild in the database.
 * @property {string} guildId - The guild ID.
 * @property {string} name - The guild name.
 * @property {string} prefix - The guild prefix.
 *
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class Guild {
  @PrimaryColumn()
  guildId: string;

  @Column()
  name: string;

  @Column({ default: '!' })
  prefix: string;
}
