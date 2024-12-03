import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * User entity
 * @description User entity for the database
 * @property {string} id - The user's ID
 * @property {string} username - The user's username
 * @property {string} displayName - The user's display name
 * @property {string} backgroundImageURL - The user's background image URL
 * @property {number} karma - The user's karma
 * @property {number} coins - The user's coins
 * @property {boolean} pointsSuspended - Whether the user's points are suspended
 * @property {boolean} commandsSuspended - Whether the user's commands are suspended
 * @property {boolean} doNotNotifyOnLevelUp - Whether the user should not be notified on level up
 * @property {number} warns - The user's warns
 * @property {Date} createdAt - The date the user was created
 * @property {Date} updatedAt - The date the user was last updated
 *
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

  @Column()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
