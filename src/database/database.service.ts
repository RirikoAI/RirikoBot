// src/users/user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '#database/entities/role.entity';
import { Guild } from '#database/entities/guild.entity';
import { MusicChannel } from '#database/entities/music-channel.entity';
import { Playlist } from '#database/entities/playlist.entity';
import { Track } from '#database/entities/track.entity';
import { VoiceChannel } from '#database/entities/voice-channel.entity';

@Injectable()
export class DatabaseService {
  constructor(
    @InjectRepository(Guild)
    readonly guildRepository: Repository<Guild>,
    @InjectRepository(MusicChannel)
    readonly musicChannelRepository: Repository<MusicChannel>,
    @InjectRepository(Playlist)
    readonly playlistRepository: Repository<Playlist>,
    @InjectRepository(Role)
    readonly roleRepository: Repository<Role>,
    @InjectRepository(Track)
    readonly trackRepository: Repository<Track>,
    @InjectRepository(VoiceChannel)
    readonly voiceChannelRepository: Repository<VoiceChannel>,
  ) {}
}
