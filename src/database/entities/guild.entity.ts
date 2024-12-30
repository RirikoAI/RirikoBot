import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { VoiceChannel } from '#database/entities/voice-channel.entity';
import { MusicChannel } from '#database/entities/music-channel.entity';
import { GuildConfig } from '#database/entities/guild-config.entity';
import { StreamNotification } from '#database/entities/stream-notification.entity';
import { StreamSubscription } from '#database/entities/stream-subscription.entity';
import { UserNote } from '#database/entities/user-note.entity';
import { EntityHelper } from '#util/entities/entity-helper';

/**
 * Guild Entity
 * @description The guild entity represents a guild in the database.
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class Guild extends EntityHelper {
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

  @OneToMany(
    () => StreamNotification,
    (streamNotification) => streamNotification.guild,
  )
  streamNotifications: StreamNotification[];

  @OneToMany(
    () => StreamSubscription,
    (streamSubscription) => streamSubscription.guild,
  )
  streamSubscriptions: StreamSubscription[];

  @OneToMany(() => UserNote, (userNote) => userNote.guild)
  userNotes: UserNote[];
}
