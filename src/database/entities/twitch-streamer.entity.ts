import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EntityHelper } from '#util/entities/entity-helper';

@Entity()
export class TwitchStreamer extends EntityHelper {
  @PrimaryColumn()
  twitchUserId: string;

  @Column({
    default: false,
  })
  isLive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
