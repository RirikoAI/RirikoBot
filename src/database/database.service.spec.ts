import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseService } from './database.service';
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

describe('DatabaseService', () => {
  let service: DatabaseService;
  // let guildRepository: Repository<Guild>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: getRepositoryToken(Guild), useClass: Repository },
        { provide: getRepositoryToken(MusicChannel), useClass: Repository },
        { provide: getRepositoryToken(Playlist), useClass: Repository },
        { provide: getRepositoryToken(Track), useClass: Repository },
        { provide: getRepositoryToken(VoiceChannel), useClass: Repository },
        { provide: getRepositoryToken(User), useClass: Repository },
        { provide: getRepositoryToken(GuildConfig), useClass: Repository },
        { provide: getRepositoryToken(Configuration), useClass: Repository },
        {
          provide: getRepositoryToken(StreamSubscription),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(StreamNotification),
          useClass: Repository,
        },
        { provide: getRepositoryToken(TwitchStreamer), useClass: Repository },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    // guildRepository = module.get<Repository<Guild>>(getRepositoryToken(Guild));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have guildRepository defined', () => {
    expect(service.guildRepository).toBeDefined();
  });
});
