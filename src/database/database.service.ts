// src/users/user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Guild } from '#database/entities/guild.entity';
import { MusicChannel } from '#database/entities/music-channel.entity';
import { Playlist } from '#database/entities/playlist.entity';
import { Track } from '#database/entities/track.entity';
import { VoiceChannel } from '#database/entities/voice-channel.entity';
import { User } from '#database/entities/user.entity';
import { GuildConfig } from '#database/entities/guild-config.entity';
import { Configuration } from '#database/entities/configuration.entity';
import { StreamSubscription } from '#database/entities/stream-subscription.entity';
import { StreamNotification } from '#database/entities/stream-notification.entity';
import { TwitchStreamer } from '#database/entities/twitch-streamer.entity';

@Injectable()
export class DatabaseService {
  constructor(
    @InjectRepository(Guild)
    public guildRepository: Repository<Guild>,
    @InjectRepository(MusicChannel)
    public musicChannelRepository: Repository<MusicChannel>,
    @InjectRepository(Playlist)
    public playlistRepository: Repository<Playlist>,
    @InjectRepository(Track)
    public trackRepository: Repository<Track>,
    @InjectRepository(VoiceChannel)
    public voiceChannelRepository: Repository<VoiceChannel>,
    @InjectRepository(User)
    public userRepository: Repository<User>,
    @InjectRepository(GuildConfig)
    public guildConfigRepository: Repository<GuildConfig>,
    @InjectRepository(Configuration)
    public configRepository: Repository<Configuration>,
    @InjectRepository(StreamSubscription)
    public streamSubscriptionRepository: Repository<StreamSubscription>,
    @InjectRepository(StreamNotification)
    public streamNotificationRepository: Repository<StreamNotification>,
    @InjectRepository(TwitchStreamer)
    public twitchStreamerRepository: Repository<TwitchStreamer>,
  ) {}
}
