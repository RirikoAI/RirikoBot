import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Reminder entity
 * @description Entity for storing user reminders
 */
@Entity()
export class Reminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  channelId: string;

  @Column()
  guildId: string;

  @Column()
  message: string;

  @Column()
  scheduledTime: Date;

  @Column({
    default: false,
  })
  sent: boolean;

  @Column({
    default: null,
    nullable: true,
  })
  timezone: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}