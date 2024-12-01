import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { VoiceChannel } from '#database/entities/voice-channel.entity';
import { MusicChannel } from '#database/entities/music-channel.entity';
import { GuildConfig } from '#database/entities/guild-config.entity';

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

  @OneToMany(() => MusicChannel, (musicChannel) => musicChannel.guild)
  musicChannels: VoiceChannel[];

  @OneToMany(() => GuildConfig, (guildConfig) => guildConfig.guild, {
    eager: true,
  })
  configurations: GuildConfig[];
}
