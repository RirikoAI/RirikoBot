import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserNote } from '#database/entities/user-note.entity';

/**
 * User entity
 * @description User entity for the database
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class User {
  @PrimaryColumn()
  id: string;

  @Column()
  username: string;

  @Column()
  displayName: string;

  @Column({
    default: null,
  })
  backgroundImageURL: string;

  @Column({
    default: 0,
  })
  karma: number;

  @Column({
    default: 0,
  })
  coins: number;

  @Column({
    default: false,
  })
  pointsSuspended: boolean;

  @Column({
    default: false,
  })
  commandsSuspended: boolean;

  @Column({
    default: false,
  })
  doNotNotifyOnLevelUp: boolean;

  @Column({
    default: 0,
  })
  warns: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => UserNote, (userNote) => userNote.user)
  notes: UserNote[];
}
