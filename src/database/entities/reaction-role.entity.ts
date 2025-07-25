import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Guild } from '#database/entities/guild.entity';

/**
 * ReactionRole Entity
 * @description The reaction role entity represents a reaction role configuration in the database.
 * @property {string} id - The reaction role configuration ID.
 * @property {string} messageId - The message ID that the reaction is attached to.
 * @property {string} emoji - The emoji that triggers the role assignment.
 * @property {string} roleId - The role ID to assign when the reaction is triggered.
 *
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class ReactionRole {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  messageId: string;

  @Column()
  emoji: string;

  @Column()
  roleId: string;

  @ManyToOne(() => Guild, (guild) => guild.reactionRoles)
  guild: Guild;
}