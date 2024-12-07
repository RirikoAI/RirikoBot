import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { ConfigService as RirikoConfigService } from '#config/config.service';
import { DatabaseService } from '#database/database.service';
import { DiscordService } from '#discord/discord.service';
import { GuildTextBasedChannel } from 'discord.js';

@Injectable()
export class TwitchService {
  private readonly logger = new Logger('Ririko TwitchService');
  private clientId: string;
  private clientSecret: string;
  private loggedIn = false;
  private retriesLeft = 5;
  accessToken: string;

  constructor(
    @Inject(forwardRef(() => DatabaseService))
    readonly db: DatabaseService,
    readonly config: RirikoConfigService,
    @Inject(forwardRef(() => DiscordService))
    readonly discordService: DiscordService,
  ) {
    this.logger.log('TwitchService initialized');
  }

  async login(): Promise<boolean> {
    if (this.retriesLeft <= 0) return false;

    const config = await this.config.getAllConfig();
    if (!config.twitchClientId || !config.twitchClientSecret) {
      this.logger.error(
        'Twitch client ID and/or secret not set, disabling Twitch service',
      );
      this.retriesLeft = 0;
      return false;
    }

    this.clientId = config.twitchClientId;
    this.clientSecret = config.twitchClientSecret;

    try {
      const tokenResponse = await axios.post(
        'https://id.twitch.tv/oauth2/token',
        null,
        {
          params: {
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: 'client_credentials',
          },
        },
      );

      if (tokenResponse.data.access_token) {
        this.accessToken = tokenResponse.data.access_token;
        this.loggedIn = true;
        this.retriesLeft = 5; // Reset retries left on successful login
        return true;
      } else {
        this.retriesLeft--;
        return this.login();
      }
    } catch (error) {
      this.logger.error(error);
      this.retriesLeft--;
      return this.login();
    }
  }

  async checkStreamers(streamerNames: string[]): Promise<any> {
    if (!this.accessToken) await this.login();

    try {
      const streamsResponse = await axios.get(
        'https://api.twitch.tv/helix/streams',
        {
          headers: {
            'Client-ID': this.clientId,
            Authorization: `Bearer ${this.accessToken}`,
          },
          params: {
            user_login: streamerNames,
          },
        },
      );

      const streamers = streamsResponse.data.data;
      const onlineStreamersArray = streamers
        .filter((streamer) => streamer.type === 'live')
        .map((streamer) => streamer.user_login);

      const offlineStreamersArray = streamerNames.filter(
        (name) => !onlineStreamersArray.includes(name),
      );

      return {
        onlineStreamersArray,
        offlineStreamersArray,
        onlineStreamers: streamers,
        streamIdsArray: streamers.map((streamer) => streamer.id),
      };
    } catch (error) {
      this.logger.error('Error:', error.message);
      if (error.response && error.response.status === 401) {
        this.loggedIn = false;
        await this.login();
      }
    }
  }

  async checkGuildSubscriptions(): Promise<any[]> {
    const subscriptions = await this.db.streamSubscriptionRepository.find();
    const streamerNames = subscriptions.map((sub) => sub.twitchUserId);
    const streamerStatus = await this.checkStreamers(streamerNames);

    const activeSubscriptions = subscriptions.filter((sub) =>
      streamerStatus.onlineStreamersArray.includes(sub.twitchUserId),
    );

    const guildSubscriptions = activeSubscriptions.map((sub) => {
      const streamer = streamerStatus.onlineStreamers.find(
        (stream) => stream.user_login === sub.twitchUserId,
      );
      return { ...sub, streamer };
    });

    const notifications = await this.db.streamNotificationRepository.find();
    const queuedMessages = guildSubscriptions
      .filter(
        (sub) => !notifications.some((n) => n.streamId === sub.streamer.id),
      )
      .map((sub) => ({
        message: `${sub.twitchUserId} is online`,
        streamer: sub.streamer,
        guild: sub.guild.id,
        channelId: sub.channelId,
      }));

    return queuedMessages;
  }

  async sendNotification(queuedMessages: any[]): Promise<void> {
    for (const message of queuedMessages) {
      const discordChannel = this.discordService.client.channels.cache.get(
        message.channelId,
      ) as GuildTextBasedChannel;

      await discordChannel.send({
        content: message.message,
        embeds: [
          {
            title: message.streamer.title,
            description: message.streamer.user_name,
            url: `https://twitch.tv/${message.streamer.user_name}`,
            image: {
              url: message.streamer.thumbnail_url
                .replace('{width}', '1280')
                .replace('{height}', '720'),
            },
          },
        ],
      });

      await this.db.streamNotificationRepository.insert({
        twitchUserId: message.streamer.user_name,
        streamId: message.streamer.id,
        guild: { id: message.guild },
        channelId: message.channelId,
        notified: true,
      });
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {
    if (!this.loggedIn) await this.login();
    if (this.loggedIn) {
      const queuedMessages = await this.checkGuildSubscriptions();
      await this.sendNotification(queuedMessages);
    }
  }
}
