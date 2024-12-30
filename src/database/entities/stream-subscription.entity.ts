import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Guild } from '#database/entities/guild.entity';
import { EntityHelper } from '#util/entities/entity-helper';

/**
 * StreamSubscription Entity
 * @description Contains guild subscriptions for Twitch streams
 */
@Entity()
export class StreamSubscription extends EntityHelper {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  twitchUserId: string;

  @Column()
  channelId: string;

  @ManyToOne(() => Guild, (guild) => guild.streamNotifications, {
    eager: true,
  })
  guild: Guild;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
