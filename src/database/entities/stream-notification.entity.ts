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
 * StreamNotification Entity
 * @description Contains notifications of streams for guilds (sent or not)
 * @property {string} id - The stream notification ID.
 * @property {string} twitchUserId - The Twitch user ID.
 * @property {string} channelId - The channel ID to send the notification.
 * @property {string} streamId - The Twitch stream ID.
 * @property {boolean} notified - The notification status.
 * @property {Guild} guild - The guild that the stream notification belongs to.
 * @property {Date} createdAt - The creation date of the stream notification.
 * @property {Date} updatedAt - The last update date of the stream notification.
 *
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class StreamNotification {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  twitchUserId: string;

  @Column()
  channelId: string;

  @Column()
  streamId: string;

  @Column({
    default: false,
  })
  notified: boolean;

  @ManyToOne(() => Guild, (guild) => guild.streamNotifications)
  guild: Guild;

  @Column()
  guildId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
