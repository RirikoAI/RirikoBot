import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Guild } from '#database/entities/guild.entity';

/**
 * FreeGameNotification Entity
 * @description Contains notifications of free games for guilds (sent or not)
 * @property {string} id - The free game notification ID.
 * @property {string} gameId - The game ID or unique identifier.
 * @property {string} gameName - The name of the free game.
 * @property {string} source - The source of the free game (Epic, Steam, etc.).
 * @property {boolean} notified - The notification status.
 * @property {Guild} guild - The guild that the free game notification belongs to.
 * @property {Date} createdAt - The creation date of the free game notification.
 * @property {Date} updatedAt - The last update date of the free game notification.
 *
 * @author AI Assistant
 */
@Entity()
export class FreeGameNotification {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  gameId: string;

  @Column()
  gameName: string;

  @Column()
  source: string;

  @Column({
    default: false,
  })
  notified: boolean;

  @ManyToOne(() => Guild, (guild) => guild.freeGameNotifications)
  guild: Guild;

  @Column()
  guildId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}