// src/users/user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Guild } from '#database/entities/guild.entity';
import { MusicChannel } from '#database/entities/music-channel.entity';
import { Playlist } from '#database/entities/playlist.entity';
import { Track } from '#database/entities/track.entity';
import { VoiceChannel } from '#database/entities/voice-channel.entity';

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
  ) {}
}
