import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Guild } from '#database/entities/guild.entity';
import { User } from '#database/entities/user.entity';
import { EntityHelper } from '#util/entities/entity-helper';

/**
 * UserNotes entity
 * @description The user notes entity represents a note for a user in the database.
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class UserNote extends EntityHelper {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  note: string;

  @Column()
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Guild, (guild) => guild.musicChannels)
  guild: Guild;

  @ManyToOne(() => User, (user) => user.notes)
  user: User;
}
