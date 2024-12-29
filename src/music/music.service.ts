import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DiscordService } from '#discord/discord.service';
import { TextChannel } from 'discord.js';
import { addButtons } from '#util/features/add-buttons.feature';
import { StringUtil } from '#util/string/string.util';
import { Queue } from 'distube';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { DatabaseService } from '#database/database.service';

const { EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { DeezerPlugin } = require('@distube/deezer');
const { YouTubePlugin } = require('@distube/youtube');

/**
 * Ririko Music class to handle all Distube events
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export class MusicService {
  distube: typeof DisTube;
  youtubePlugin: typeof YouTubePlugin;

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

  async createPlayer() {
    const youtubePlugin = new YouTubePlugin();
    this.youtubePlugin = youtubePlugin;

    const distube = new DisTube(this.discord.client, {
      emitNewSongOnly: false,
      emitAddSongWhenCreatingQueue: false,
      emitAddListWhenCreatingQueue: false,
      plugins: [
        youtubePlugin,
        new SpotifyPlugin(),
        new SoundCloudPlugin(),
        new DeezerPlugin(),
      ],
    });

    this.distube = this.registerEvents(distube);
    return this.distube;
  }

  async search(params: { query: string }) {
    const { query } = params;
    const results = await this.youtubePlugin.search(query, {
      type: 'video',
      limit: 1,
      safeSearch: true,
    });

    if (results.length === 0) {
      return;
    }
    return results[0];
  }

  registerEvents(distube: typeof DisTube) {
    // DisTube event listeners, more in the documentation page
    distube
      .on('playSong', async (queue, song) => {
        await this.trackMusic(queue?.textChannel?.guild?.id);
        let volume = queue.volume || 50;

        if (volume < 0) {
          volume = 0;
        }

        queue.setVolume(volume);
        await this.updateMusicChannel({ channel: queue.textChannel, song });
      })
      .on('addSong', (queue, song) =>
        queue.textChannel?.send(
          `Added ${song.name} - \`${song.formattedDuration}\` to the queue by ${song.user}`,
        ),
      )
      .on('addList', (queue, playlist) =>
        queue.textChannel?.send(
          `Added ${playlist.songs.length} songs to queue\n`,
        ),
      )
      .on('error', (textChannel, e) => {
        console.error(e);
      })
      .on('finish', async (queue) => {
        await this.stopTrackingMusic(queue.textChannel?.guild?.id);
        await this.clearPlayer(queue.textChannel as TextChannel);
      })
      .on('finishSong', (queue) => {})
      .on('disconnect', async (queue) => {
        await this.stopTrackingMusic(queue.textChannel?.guild?.id);
        await this.clearPlayer(queue.textChannel as TextChannel);
      })
      .on('empty', (queue) =>
        queue.textChannel?.send(
          'The voice channel is empty! Leaving the voice channel...',
        ),
      );

    return distube;
  }

  async trackMusic(guildId) {
    // get the interval from the guild config
    const interval = this.guildConfig.find(
      (v) => v.guildId === guildId,
    )?.interval;

    // get the music channel of the guild
    const musicChannel = await this.db.musicChannelRepository.findOne({
      where: {
        guild: {
          id: guildId,
        },
      },
    });

    // if music channel not found, return
    if (!musicChannel) {
      return;
    }

    // if interval not exists, push a new one
    if (!interval) {
      this.guildConfig.push({
        guildId: guildId,
        interval: setInterval(
          () => this.handleGuildInterval(guildId, musicChannel.id),
          10000,
        ),
      });
    } else {
      // if interval exists, clear the interval
      clearInterval(interval);

      // push a new interval
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

  async stopTrackingMusic(guildId) {
    // get the interval from the guild config
    const interval = this.guildConfig.find(
      (v) => v.guildId === guildId,
    )?.interval;

    // if interval exists, clear the interval
    if (interval) {
      clearInterval(interval);
    }
  }

  handleGuildInterval(guildId, channelId) {
    // find the music channel from the discord client
    this.discord.client.channels
      .fetch(channelId)
      .then((channel: TextChannel) => {
        const queue = this.distube.getQueue(guildId);
        if (!queue) {
          return;
        }

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

  async handleMusic(message: any) {
    // if message is not from a guild, return
    if (!message.guild) return;

    // get the guild prefix
    const guild = await this.db.guildRepository.findOne({
      where: {
        id: message?.guild?.id,
      },
    });

    if (!guild) {
      return;
    }

    // check if the message has a prefix
    const prefix = guild.prefix;

    if (message.content.startsWith(prefix) || message.content.startsWith('!')) {
      return;
    }

    // check if the message is sent on a music-channel in the guild in the database
    const musicChannel = await this.db.musicChannelRepository.findOne({
      where: {
        id: message.channel.id,
      },
    });

    if (!musicChannel) {
      return;
    }

    try {
      await this.distube.play(
        message.member.voice.channel,
        message.toString(),
        {
          member: message.member,
          textChannel: message.channel,
          message,
        },
      );
    } catch (e) {
      if (e.message.includes('voiceChannel')) {
        message.channel.send('Please join a voice channel to play a music');
      } else {
        throw e;
      }
    }
  }

  async muteMusic(interaction: DiscordInteraction | DiscordMessage) {
    // get current volume
    const queue = this.distube.getQueue(interaction.guild.id);
    const currentVolume = queue?.volume;
    let muted;
    if (currentVolume === 0) {
      // get the guild volume setting
      const guildVolume = this.guildConfig.find(
        (v) => v.guildId === interaction.guild.id,
      );

      // if the guild volume setting exists, set the volume to the guild volume
      if (guildVolume) {
        await this.distube.setVolume(interaction.guild.id, guildVolume.volume);
      } else {
        // set the volume to 50 if the guild volume setting does not exist
        await this.distube.setVolume(interaction.guild.id, 50);
      }
      muted = false;
    } else {
      // stores current volume to guildVolume if it doesnt exist
      if (!this.guildConfig.find((v) => v.guildId === interaction.guild.id)) {
        this.guildConfig.push({
          guildId: interaction.guild.id,
          volume: currentVolume,
        });
      } else {
        // updates the volume if it exists
        this.guildConfig.find(
          (v) => v.guildId === interaction.guild.id,
        ).volume = currentVolume;
      }

      await this.distube.setVolume(interaction.guild.id, 0);
      muted = true;
    }

    await this.sendEmbed({
      musicChannel: interaction.channel as TextChannel,
      queue,
      song: queue.songs[0],
      muted,
      interaction,
    });
  }

  async setVolume(
    interaction: DiscordInteraction | DiscordMessage,
    volume: number,
  ) {
    if (volume < 0 || volume > 100) {
      return;
    }

    await this.distube.setVolume(interaction.guild.id, volume);

    // get the guild music channel
    const musicChannel = await this.db.musicChannelRepository.findOne({
      where: {
        guild: {
          id: interaction.guild.id,
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

    const queue = this.distube.getQueue(interaction.guild.id);
    await this.sendEmbed({
      musicChannel: textChannel as TextChannel,
      queue,
      song: queue.songs[0],
      interaction,
    });
  }

  async pauseMusic(interaction: DiscordInteraction | DiscordMessage) {
    const queue = this.distube.getQueue(interaction.guild.id);
    if (!queue) {
      return;
    }

    if (queue.paused) {
      await this.distube.resume(interaction.guild.id);
      await this.sendEmbed({
        musicChannel: interaction.channel as TextChannel,
        queue,
        song: queue.songs[0],
        paused: false,
        interaction,
      });
      return;
    }

    await this.distube.pause(interaction.guild.id);
    await this.sendEmbed({
      musicChannel: interaction.channel as TextChannel,
      queue,
      song: queue.songs[0],
      paused: true,
      interaction,
    });
  }

  async stopMusic(interaction: DiscordInteraction | DiscordMessage) {
    try {
      await this.stopTrackingMusic(interaction.guildId);
      await this.distube.stop(interaction.guildId);
    } catch (e) {}
    await this.clearPlayer(interaction.channel as TextChannel);
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

  async resumeMusic(interaction: DiscordInteraction) {
    const queue = this.distube.getQueue(interaction.guild.id);
    if (!queue) {
      return;
    }

    await this.distube.resume(interaction.guild.id);
    await this.sendEmbed({
      musicChannel: interaction.channel as TextChannel,
      queue,
      song: queue.songs[0],
      paused: false,
      interaction,
    });
  }

  async repeatQueue(interaction: DiscordInteraction | DiscordMessage) {
    const queue = this.distube.getQueue(interaction.guild.id);
    if (!queue) {
      console.error('no queue');
      return;
    }

    // cycle between repeat modes
    const repeatMode =
      queue.repeatMode === 0 ? 1 : queue.repeatMode === 1 ? 2 : 0;
    await this.distube.setRepeatMode(interaction.guild.id, repeatMode);

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

  async updateMusicChannel(params: { channel: any; song: any }) {
    const { channel, song } = params;
    const guildId = channel.guild.id;
    const musicChannel = await this.db.musicChannelRepository.findOne({
      where: {
        guild: {
          id: guildId,
        },
      },
    });

    if (!musicChannel) {
      return;
    }

    // get the channel
    const textChannel = await this.discord.client.channels
      .fetch(musicChannel.id)
      .then((channel) => {
        return channel;
      });

    if (!textChannel) {
      // reply to the interaction that the channel is not found
      console.log(channel, 'Channel not found');
      return;
    }

    // delete all messages in the music channel
    const messages = await (textChannel as TextChannel).messages.fetch();

    await Promise.all(messages.map((message) => message.delete()));

    const queue = this.distube.getQueue(guildId);

    // textChannel.send({ embeds: [embed] }).catch((e) => {});
    await this.sendEmbed({ musicChannel: channel, song: song, queue: queue });
  }

  async setupMusicChannel(params: { interaction: any; musicChannel: any }) {
    const { interaction, musicChannel } = params;
    // upsert the music channel in the database tied to the guild
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

  prepareEmbed(params) {
    const { song, queue } = params;

    const currentTime = queue?.currentTime;
    let formattedTime;
    if (currentTime) {
      // format current time to be minutes and seconds, with 00:00 as the format.
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
        //
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

  async sendEmbed(params: {
    musicChannel: TextChannel;
    song?: {
      name: string;
      thumbnail: string;
      uploader: {
        name: string;
      };
      formattedDuration: string;
      source: string;
      url: string;
      user?: {
        id: string | null;
      };
    };
    queue?: Queue;
    paused?: boolean;
    interaction?: DiscordInteraction | DiscordMessage | any;
    muted?: boolean;
    repeatMode?: number;
  }) {
    const { musicChannel, song, paused, muted, interaction } = params;
    // send a new message to the music channel, with an embed with ascii music player art
    const embed = this.prepareEmbed(params);

    const row1Buttons = [
      { customId: 'previous', label: '⏮️', style: ButtonStyle.Primary },
      paused
        ? {
            customId: 'play',
            label: '▶️',
            style: ButtonStyle.Primary,
          }
        : {
            customId: 'pause',
            label: '⏸️',
            style: ButtonStyle.Primary,
          },
      { customId: 'skip', label: '⏭️', style: ButtonStyle.Primary },
      { customId: 'stop', label: '🛑', style: ButtonStyle.Danger },
      muted
        ? { customId: 'unmute', label: '🔊', style: ButtonStyle.Secondary }
        : {
            customId: 'mute',
            label: '🔇',
            style: ButtonStyle.Secondary,
          },
    ];

    const row2Buttons = [
      { customId: 'repeat', label: '🔁', style: ButtonStyle.Secondary },
      { customId: 'lyrics', label: 'Lyrics', style: ButtonStyle.Secondary },
      {
        customId: 'playlists',
        label: 'Playlists',
        style: ButtonStyle.Secondary,
      },
      {
        customId: 'queue',
        label: 'Queue',
        style: ButtonStyle.Secondary,
      },
    ];

    if (interaction) {
      if (interaction.message) {
        await interaction.message.edit({
          embeds: [embed],
          components: [addButtons(row1Buttons), addButtons(row2Buttons)],
        });
      } else {
        // find the top most message in the music channel and edit it
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

    // set the channel topic to not playing anything
    await musicChannel.setTopic(
      `🎵 Now
    Playing: ${song?.name || 'Nothing is playing'} (${song?.formattedDuration || '0:00'})`,
    );
  }

  getControlButtons(backId, forwardId) {
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

  player(): typeof DisTube {
    return this.distube;
  }
}
