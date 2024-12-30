import { Column, Entity, ManyToOne, PrimaryColumn } from 'typeorm';
import { Guild } from '#database/entities/guild.entity';
import { EntityHelper } from '#util/entities/entity-helper';

/**
 * Voice Channel Entity
 * @description The voice channel entity represents a voice channel in the database.
 * @property {string} channelId - The channel ID.
 * @property {string} name - The channel name.
 * @property {string} guildId - The guild ID.
 *
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class VoiceChannel extends EntityHelper {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({
    default: null,
  })
  parentId?: string;

  @ManyToOne(() => Guild, (guild) => guild.voiceChannels)
  guild: Guild;
}
