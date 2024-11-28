import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

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

  @Column()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
