import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  DeleteDateColumn,
} from 'typeorm';
import { User } from '#database/entities/user.entity';
import { Allow } from 'class-validator';
import { EntityHelper } from '#util/entities/entity-helper';

@Entity()
export class Forgot extends EntityHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Allow()
  @Column()
  @Index()
  hash: string;

  @Allow()
  @ManyToOne(() => User, {
    eager: true,
  })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
