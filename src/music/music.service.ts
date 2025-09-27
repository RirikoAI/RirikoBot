import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { DiscordService } from '#discord/discord.service';
import {
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';
import { addButtons } from '#util/features/add-buttons.feature';
import { StringUtil } from '#util/string/string.util';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { DatabaseService } from '#database/database.service';
import { MusicAdapterInterface, Queue } from './music.adapter.interface';
import { DisTubeAdapter } from '#music/adapters/distube.adapter';
import { LavaSharkAdapter } from '#music/adapters/lavashark.adapter';
import { Player, Track } from 'lavashark';

@Injectable()
export class MusicService {
  private musicPlayer: MusicAdapterInterface;
  youtube: any;

  // stores guild volume in guild setting
  guildConfig: {
    guildId: string;
    volume?: number;
    interval?: any;
  }[] = [];

  constructor(
    @Inject(forwardRef(() => DiscordService))
    readonly discord: DiscordService,
    @Inject()
    readonly db: DatabaseService,
  ) {}

  public async initializeMusicPlayer(): Promise<void> {
    if (process.env.MUSIC_PLAYER === 'lavashark') {
      console.log('Using LavaShark as music player');
      this.musicPlayer = new LavaSharkAdapter(this.discord.client);
    } else {
      console.log('Using DisTube as music player');
      this.musicPlayer = new DisTubeAdapter(this.discord.client);
    }
    this.registerEvents();
  }

  /**
   * Registers event listeners for the music player to handle various music-related events.
   * @private
   */
  private registerEvents(): void {
    // Distube Events
    this.musicPlayer.on('playSong', async (queue: Queue, song: any) => {
      await this.trackMusic(queue.textChannel.guild.id);
      let volume = queue.volume || 50;

      if (volume < 0) {
        volume = 0;
      }

      await this.musicPlayer.setVolume(queue.textChannel.guild.id, volume);
      await this.updateMusicChannel({ channel: queue.textChannel, song });
    });

    this.musicPlayer.on('addSong', async (queue: Queue, song: any) => {
      queue.textChannel?.send(
        `Added ${song.name} - \`${song.formattedDuration}\` to the queue by ${song.user}`,
      );
    });

    this.musicPlayer.on('addList', async (queue: Queue, playlist: any) => {
      queue.textChannel?.send(
        `Added ${playlist.songs.length} songs to queue\n`,
      );
    });

    this.musicPlayer.on('error', async (textChannel: any, e: Error) => {
      console.error(e);
    });

    this.musicPlayer.on('finish', async (queue: Queue) => {
      await this.stopTrackingMusic(queue.textChannel.guild.id);
      await this.clearPlayer(queue.textChannel as TextChannel);
    });

    this.musicPlayer.on('finishSong', async (queue: Queue) => {
      console.log('Song finished in guild', queue);
    });

    this.musicPlayer.on('disconnect', async (queue: Queue) => {
      await this.stopTrackingMusic(queue.textChannel.guild.id);
      await this.clearPlayer(queue.textChannel as TextChannel);
    });

    this.musicPlayer.on('empty', async (queue: Queue) => {
      queue.textChannel?.send(
        'The voice channel is empty! Leaving the voice channel...',
      );
    });

    // LavaShark Events
    this.musicPlayer.on('trackStart', async (player: Player, track: Track) => {
      await this.trackMusic(player.guildId);
      const queue = (await this.musicPlayer.getQueue(player.guildId)) as any;
      let volume = queue?.volume || 50;

      if (volume < 0) {
        volume = 0;
      }

      await this.musicPlayer.setVolume(player.guildId, volume);

      // get discord channel
      const channel = (await this.discord.client.channels.fetch(
        player.textChannelId,
      )) as TextChannel;

      await this.updateMusicChannel({
        channel: channel,
        song: {
          name: track.title,
          // track.duration.value is in milliseconds, convert to minutes:seconds
          formattedDuration: new Date(track.duration.value)
            .toISOString()
            .substr(track.duration.value >= 3600000 ? 11 : 14, 8)
            .split('.')[0],
          user: { id: 'Unknown' },
          url: track.uri,
          thumbnail: '',
          duration: track.duration.value,
          source: 'youtube',
          uploader: { name: track.author },
        },
      });
    });
  }

  /**
   * Resumes the music playback if it is currently paused.
   * @param interaction
   */
  async resumeMusic(interaction: DiscordInteraction) {
    const queue = await this.musicPlayer.getQueue(interaction.guild.id);
    if (!queue) {
      return;
    }

    await this.musicPlayer.resume(interaction.guild.id);
    await this.sendEmbed({
      musicChannel: interaction.channel as TextChannel,
      queue,
      song: queue.songs[0],
      paused: false,
      interaction,
    });
  }

  /**
   * Handles incoming messages to check for music commands or play music in designated channels.
   * @param message
   */
  async handleMusic(message: any) {
    if (!message.guild) return;

    const guild = await this.db.guildRepository.findOne({
      where: { id: message?.guild?.id },
    });

    if (!guild) return;

    const prefix = guild.prefix;
    if (message.content.startsWith(prefix) || message.content.startsWith('!')) {
      return;
    }

    const musicChannel = await this.db.musicChannelRepository.findOne({
      where: { id: message.channel.id },
    });

    if (!musicChannel) return;

    try {
      await this.musicPlayer.play(
        message.member.voice.channel,
        message.toString(),
        {
          member: message.member,
          textChannel: message.channel,
          message,
        },
      );
    } catch (e) {
      console.error('Error playing music:', e);
      if (e.message.includes('voiceChannel')) {
        message.channel.send('Please join a voice channel to play music');
      } else {
        throw e;
      }
    }
  }

  /**
   * Pauses or resumes the music playback based on the current state.
   * @param interaction
   */
  async pauseMusic(interaction: DiscordInteraction | DiscordMessage) {
    const queue = await this.musicPlayer.getQueue(interaction.guild.id);
    if (!queue) {
      return;
    }

    if (queue.paused) {
      await this.musicPlayer.resume(interaction.guild.id);
      await this.sendEmbed({
        musicChannel: interaction.channel as TextChannel,
        queue,
        song: queue.songs[0],
        paused: false,
        interaction,
      });
      return;
    }

    await this.musicPlayer.pause(interaction.guild.id);
    await this.sendEmbed({
      musicChannel: interaction.channel as TextChannel,
      queue,
      song: queue.songs[0],
      paused: true,
      interaction,
    });
  }

  /**
   * Stops the music playback and clears the player state.
   * @param interaction
   */
  async stopMusic(interaction: DiscordInteraction | DiscordMessage) {
    try {
      await this.stopTrackingMusic(interaction.guildId);
      await this.musicPlayer.stop(interaction.guildId);
    } catch (e) {
      console.error('Error stopping music:', e);
    }
    await this.clearPlayer(interaction.channel as TextChannel);
  }

  /**
   * Mutes or unmutes the music by setting the volume to 0 or restoring it to the previous level.
   * @param interaction
   */
  async muteMusic(interaction: DiscordInteraction | DiscordMessage) {
    const queue = await this.musicPlayer.getQueue(interaction.guild.id);
    const currentVolume = await this.musicPlayer.getVolume(
      interaction.guild.id,
    );
    if (!queue) {
      return;
    }

    const muted = currentVolume > 0;
    if (muted) {
      await this.musicPlayer.setVolume(interaction.guild.id, 0);
    } else {
      // get the volume from guildConfig or set to default 50
      const guildSettings = this.guildConfig.find(
        (v) => v.guildId === interaction.guild.id,
      );
      const volume = guildSettings?.volume || 50;
      await this.musicPlayer.setVolume(interaction.guild.id, volume); // Default volume
    }

    await this.sendEmbed({
      musicChannel: interaction.channel as TextChannel,
      queue,
      song: queue?.songs?.[0],
      muted,
      interaction,
    });
  }

  async join(voiceChannel: any) {
    await this.musicPlayer.voices.join(voiceChannel);
  }

  async setVolume(
    interaction: DiscordInteraction | DiscordMessage,
    volume: number,
  ) {
    if (volume < 0 || volume > 100) {
      return;
    }

    const guildSettings = this.guildConfig.find(
      (v) => v.guildId === interaction.guild.id,
    );

    if (guildSettings) {
      guildSettings.volume = volume;
    } else {
      this.guildConfig.push({
        guildId: interaction.guild.id,
        volume,
      });
    }

    await this.musicPlayer.setVolume(interaction.guild.id, volume);

    const musicChannel = await this.db.musicChannelRepository.findOne({
      where: {
        guild: { id: interaction.guild.id },
      },
    });

    if (!musicChannel) {
      return;
    }

    const textChannel = await this.discord.client.channels
      .fetch(musicChannel.id)
      .then((channel) => channel);

    const queue = await this.musicPlayer.getQueue(interaction.guild.id);
    await this.sendEmbed({
      musicChannel: textChannel as TextChannel,
      queue,
      song: queue?.songs?.[0],
      interaction,
    });
  }

  // Keep all your existing utility methods (they remain the same):
  async trackMusic(guildId: string) {
    const interval = this.guildConfig.find(
      (v) => v.guildId === guildId,
    )?.interval;

    const musicChannel = await this.db.musicChannelRepository.findOne({
      where: { guild: { id: guildId } },
    });

    if (!musicChannel) return;

    if (!interval) {
      this.guildConfig.push({
        guildId: guildId,
        interval: setInterval(
          () => this.handleGuildInterval(guildId, musicChannel.id),
          10000,
        ),
      });
    } else {
      clearInterval(interval);

      this.guildConfig.map((v) => {
        if (v.guildId === guildId) {
          v.interval = setInterval(
            () => this.handleGuildInterval(guildId, musicChannel.id),
            10000,
          );
        }
      });
    }
  }

  async stopTrackingMusic(guildId: string) {
    const interval = this.guildConfig.find(
      (v) => v.guildId === guildId,
    )?.interval;

    if (interval) {
      clearInterval(interval);
    }
  }

  async handleGuildInterval(guildId: string, channelId: string) {
    this.discord.client.channels
      .fetch(channelId)
      .then(async (channel: TextChannel) => {
        const queue = (await this.musicPlayer.getQueue(guildId)) as any;
        if (!queue) return;

        channel.messages.fetch().then((messages) => {
          messages.last().edit({
            embeds: [
              this.prepareEmbed({
                song: queue.songs[0],
                queue,
              }),
            ],
          });
        });
      });
  }

  async updateMusicChannel(params: {
    channel: {
      id: string;
      guild: { id: string };
    };
    song: {
      name: string;
      formattedDuration: string;
      user: { id: string };
      url: string;
      thumbnail: string;
      duration: number;
      source: string;
      uploader: { name: string };
    };
  }) {
    const { channel, song } = params;
    const guildId = channel.guild.id;
    const musicChannel = await this.db.musicChannelRepository.findOne({
      where: { guild: { id: guildId } },
    });

    if (!musicChannel) return;

    const textChannel = await this.discord.client.channels
      .fetch(musicChannel.id)
      .then((channel) => channel);

    if (!textChannel) {
      console.error(channel, 'Channel not found');
      return;
    }

    const messages = await (textChannel as TextChannel).messages.fetch();
    await Promise.all(messages.map((message) => message.delete()));

    const queue = await this.musicPlayer.getQueue(guildId);
    await this.sendEmbed({ musicChannel: channel, song: song, queue: queue });
  }

  async repeatQueue(interaction: DiscordInteraction | DiscordMessage) {
    const queue = await this.musicPlayer.getQueue(interaction.guild.id);
    if (!queue) {
      console.error('no queue');
      return;
    }

    // cycle between repeat modes
    const repeatMode =
      queue.repeatMode === 0 ? 1 : queue.repeatMode === 1 ? 2 : 0;
    await this.musicPlayer.setRepeatMode(interaction.guild.id, repeatMode);

    // find the guild music channel from the database
    const musicChannel = await this.db.musicChannelRepository.findOne({
      where: {
        guild: {
          id: interaction.guild.id,
        },
      },
    });

    if (!musicChannel) {
      console.error('no music channel');
      return;
    }

    // get the channel from discord
    const textChannel = await this.discord.client.channels
      .fetch(musicChannel.id)
      .then((channel) => {
        return channel;
      });

    await this.sendEmbed({
      musicChannel: textChannel as TextChannel,
      queue,
      song: queue.songs[0],
      interaction,
      repeatMode,
    });
  }

  prepareEmbed(params: any) {
    // Your existing implementation remains exactly the same
    const { song, queue } = params;

    const currentTime = queue?.currentTime;
    let formattedTime;
    if (currentTime) {
      formattedTime = new Date(currentTime * 1000)
        .toISOString()
        .substr(currentTime >= 3600 ? 11 : 14, 8)
        .split('.')[0];
    }

    let tracker = `[🔵──────────────]`;

    if (currentTime) {
      const beforeChar = '─';
      const afterChar = '─';
      const trackerLength = 14;
      const progress = Math.floor(
        (currentTime / song?.duration) * trackerLength,
      );
      const progressString = '🔵';
      const before = beforeChar.repeat(progress);
      const after = afterChar.repeat(trackerLength - progress);
      tracker = `[${before}${progressString}${after}]`;
    }

    return new EmbedBuilder()
      .setTitle(`🎵 ${song?.name || 'Nothing is playing'}`)
      .setDescription(
        `${tracker} ${formattedTime || '0:00'}/${song?.formattedDuration || '0:00'}`,
      )
      .setFooter({
        text: 'Ririko Music. Made with ❤️ by Ririko.',
      })
      .setThumbnail(song?.thumbnail || 'https://imgur.com/1q5Q24h.png')
      .setColor('#0099ff')
      .setTimestamp()
      .addFields(
        song?.name
          ? [
              {
                name: 'Artist/Uploader',
                value: song?.uploader?.name || 'Ririko',
                inline: true,
              },
              {
                name: 'Requested by',
                value: `<@${song?.user?.id || 'Ririko'}>`,
                inline: true,
              },
              {
                name: `Source: ${StringUtil.capitalize(song?.source || 'Nothing is playing')}`,
                value: `${song?.url}`,
              },
              {
                name: ' ',
                value: `Volume: ${queue?.volume || '0'}%, Queue: ${queue?.songs?.length || 0}, Loop: ${
                  queue?.repeatMode === 0
                    ? 'Off'
                    : queue?.repeatMode === 1
                      ? 'Song'
                      : 'Queue'
                }`,
              },
            ]
          : [],
      );
  }

  async sendEmbed(params: any) {
    // Your existing implementation remains exactly the same
    const { musicChannel, song, paused, muted, interaction } = params;
    const embed = this.prepareEmbed(params);

    const row1Buttons = [
      { customId: 'previous', label: '⏮️', style: ButtonStyle.Primary },
      paused
        ? { customId: 'play', label: '▶️', style: ButtonStyle.Primary }
        : { customId: 'pause', label: '⏸️', style: ButtonStyle.Primary },
      { customId: 'skip', label: '⏭️', style: ButtonStyle.Primary },
      { customId: 'stop', label: '🛑', style: ButtonStyle.Danger },
      muted
        ? { customId: 'unmute', label: '🔊', style: ButtonStyle.Secondary }
        : { customId: 'mute', label: '🔇', style: ButtonStyle.Secondary },
    ];

    const row2Buttons = [
      { customId: 'repeat', label: '🔁', style: ButtonStyle.Secondary },
      { customId: 'lyrics', label: 'Lyrics', style: ButtonStyle.Secondary },
      {
        customId: 'playlists',
        label: 'Playlists',
        style: ButtonStyle.Secondary,
      },
      { customId: 'queue', label: 'Queue', style: ButtonStyle.Secondary },
    ];

    if (interaction) {
      if (interaction.message) {
        await interaction.message.edit({
          embeds: [embed],
          components: [addButtons(row1Buttons), addButtons(row2Buttons)],
        });
      } else {
        const messages = await musicChannel.messages.fetch();
        const topMostMessage = messages.last();
        if (topMostMessage.author.id !== this.discord.client.user.id) {
          return;
        }
        await topMostMessage.edit({
          embeds: [embed],
          components: [addButtons(row1Buttons), addButtons(row2Buttons)],
        });
      }
    } else {
      await musicChannel.send({
        embeds: [embed],
        components: [addButtons(row1Buttons), addButtons(row2Buttons)],
      });
    }

    await musicChannel.setTopic(
      `🎵 Now Playing: ${song?.name || 'Nothing is playing'} (${song?.formattedDuration || '0:00'})`,
    );
  }

  // Other existing methods...
  getControlButtons(backId: string, forwardId: string) {
    return {
      backButton: new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
        .setCustomId(backId)
        .setDisabled(true),
      closeButton: new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
        .setCustomId('close')
        .setDisabled(true),
      forwardButton: new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('➡️')
        .setCustomId(forwardId)
        .setDisabled(true),
    };
  }

  async setupMusicChannel(params: { interaction: any; musicChannel: any }) {
    const { interaction, musicChannel } = params;

    // delete all channel if already exists
    const existingChannel = await this.db.musicChannelRepository.find({
      where: {
        guild: {
          id: interaction.guild.id,
        },
      },
    });

    if (existingChannel.length > 0) {
      // remove all existing channels
      await Promise.all(existingChannel.map((channel) => this.db.musicChannelRepository.remove(channel)));
    }

    await this.db.musicChannelRepository.upsert(
      {
        id: musicChannel.id,
        name: musicChannel.name,
        guild: {
          id: interaction.guild.id,
        },
      },
      ['id'],
    );
    await this.sendEmbed({ musicChannel });
  }

  async clearPlayer(channel: TextChannel) {
    // get the guild music channel
    const musicChannel = await this.db.musicChannelRepository.findOne({
      where: {
        guild: {
          id: channel.guild.id,
        },
      },
    });

    // if the music channel is not found, return
    if (!musicChannel) {
      return;
    }

    // get the channel
    const textChannel = await this.discord.client.channels
      .fetch(musicChannel.id)
      .then((channel) => {
        return channel;
      });

    // if the channel is not found, return
    if (!textChannel) {
      return;
    }

    // delete all messages in the music channel
    const messages = await (textChannel as TextChannel).messages.fetch();
    await Promise.all(messages.map((message) => message.delete()));

    await this.sendEmbed({
      musicChannel: textChannel as TextChannel,
      song: null,
    });

    await channel.setTopic('🎵 Now Playing: Nothing');
  }

  async getPlayer(): Promise<MusicAdapterInterface> {
    if (!this.musicPlayer) {
      await this.initializeMusicPlayer();
    }
    return this.musicPlayer;
  }
}
