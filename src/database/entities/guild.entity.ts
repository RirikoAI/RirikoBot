import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { VoiceChannel } from '#database/entities/voice-channel.entity';

/**
 * Guild Entity
 * @description The guild entity represents a guild in the database.
 * @property {string} guildId - The guild ID.
 * @property {string} name - The guild name.
 * @property {string} prefix - The guild prefix.
 *
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class Guild {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({ default: '!' })
  prefix: string;

  @OneToMany(() => VoiceChannel, (voiceChannel) => voiceChannel.guild)
  voiceChannels: VoiceChannel[];
}
