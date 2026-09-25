import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type Client,
  type Message,
  type TextChannel,
} from 'discord.js';
import type { BotServices } from '../services.js';
import type { GuildQueue, LoopMode, QueuedTrack } from '@ririko/music';
import { formatDuration, createProgressBar } from '../commands/music/commands.js';

export interface MusicEmbedState {
  hasCurrentTrack: boolean;
  hasPrevious: boolean;
  hasNextTrack: boolean;
  isPaused: boolean;
  isMuted: boolean;
  loopMode: LoopMode;
  queueSize: number;
  canShuffle?: boolean;
}

/**
 * Builds the interactive 2-row button matrix for the music controller.
 */
export function buildControllerButtonRows(
  state: MusicEmbedState,
): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('music_previous')
      .setEmoji('⏮️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!state.hasPrevious),
    new ButtonBuilder()
      .setCustomId('music_play_pause')
      .setEmoji(state.isPaused ? '▶️' : '⏸️')
      .setStyle(state.isPaused ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(!state.hasCurrentTrack),
    new ButtonBuilder()
      .setCustomId('music_skip')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!state.hasNextTrack),
    new ButtonBuilder()
      .setCustomId('music_stop')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!state.hasCurrentTrack),
    new ButtonBuilder()
      .setCustomId('music_mute_unmute')
      .setEmoji(state.isMuted ? '🔊' : '🔇')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!state.hasCurrentTrack),
  );

  const loopLabel =
    state.loopMode === 'TRACK' ? 'Track' : state.loopMode === 'QUEUE' ? 'Queue' : 'Off';

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('music_loop')
      .setEmoji('🔁')
      .setLabel(`Loop: ${loopLabel}`)
      .setStyle(state.loopMode !== 'OFF' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(!state.hasCurrentTrack),
    new ButtonBuilder()
      .setCustomId('music_shuffle')
      .setEmoji('🔀')
      .setLabel('Shuffle')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.canShuffle !== undefined ? !state.canShuffle : state.queueSize < 2),
    new ButtonBuilder()
      .setCustomId('music_lyrics')
      .setEmoji('📝')
      .setLabel('Lyrics')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!state.hasCurrentTrack),
    new ButtonBuilder()
      .setCustomId('music_queue')
      .setEmoji('📜')
      .setLabel(`Queue (${state.queueSize})`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_refresh')
      .setEmoji('🔄')
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

/**
 * Builds the Rich Embed for an active playing track.
 */
export function buildNowPlayingEmbed(
  track: QueuedTrack,
  queue: GuildQueue,
  volume: number,
): EmbedBuilder {
  const isPaused = queue.state === 'PAUSED';
  const positionSec = queue.playbackPositionSeconds;
  const durationSec = track.durationSeconds;
  const progressBar = createProgressBar(positionSec, durationSec, 14);
  const totalTracks = (queue.currentTrack ? 1 : 0) + queue.size;

  const embed = new EmbedBuilder()
    .setColor(isPaused ? 0xfee75c : 0x5865f2)
    .setTitle(`🎵 ${track.title}`)
    .setURL(track.url)
    .setDescription(
      `${progressBar}\n\`${formatDuration(positionSec)}\` / \`${formatDuration(durationSec)}\`\n${
        isPaused ? '⏸️ *Playback is currently paused*' : '▶️ *Now Playing*'
      }`,
    )
    .addFields(
      {
        name: '👤 Artist',
        value: track.artist || 'Unknown',
        inline: true,
      },
      {
        name: '🎧 Requester',
        value: `<@${track.requestedBy?.id ?? 'Unknown'}>`,
        inline: true,
      },
      {
        name: '🌐 Source',
        value: `**${track.source.toUpperCase()}**`,
        inline: true,
      },
      {
        name: '🎛️ Settings',
        value: `Volume: **${volume}%** • Loop: **${queue.loopMode}** • Filters: **${
          queue.activeFilters.length > 0 ? queue.activeFilters.join(', ') : 'None'
        }** • Queue: **${totalTracks}** (Upcoming: **${queue.size}**)`,
        inline: false,
      },
    )
    .setFooter({
      text: 'Ririko Music 2.0 • Zero-Polling Reactive UI',
    })
    .setTimestamp();

  if (track.thumbnailUrl) {
    embed.setThumbnail(track.thumbnailUrl);
  }

  return embed;
}

/**
 * Builds the Rich Embed for the idle state when no music is playing.
 */
export function buildIdleEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('🎵 Ririko Music Controller')
    .setDescription(
      '**No music is currently playing.**\n\n' +
        '• Send a song title or URL directly in this channel to start playback!\n' +
        '• Or use `/play <query>` to queue tracks.\n' +
        '• Supports YouTube, Spotify, SoundCloud, Deezer, and custom playlists.',
    )
    .addFields({
      name: '✨ Quick Controls',
      value: '`/play` • `/queue` • `/volume` • `/loop` • `/filter` • `/lyrics` • `/playlist`',
    })
    .setFooter({
      text: 'Ririko Music 2.0 • Idle',
    });
}

/**
 * Reactive Embed Controller:
 * Manages the dedicated `#music` channel persistent message and interactive button matrix.
 * Strictly event-driven with ZERO polling intervals.
 */
export class MusicEmbedController {
  private readonly client: Client;
  private readonly services: BotServices;
  private readonly guildPreviousVolumes = new Map<string, number>();
  private readonly guildUpdating = new Set<string>();
  private readonly guildUpdateQueued = new Set<string>();

  constructor(client: Client, services: BotServices) {
    this.client = client;
    this.services = services;

    this.bindMusicEvents();
  }

  /**
   * Binds to MusicPlayerService events to trigger reactive UI updates with zero polling.
   */
  private bindMusicEvents(): void {
    const player = this.services.musicPlayer;

    player.on('trackStart', (guildId) => {
      void this.updateController(guildId);
    });

    player.on('queueEnd', (guildId) => {
      void this.updateController(guildId);
    });

    player.on('stateChange', (guildId) => {
      void this.updateController(guildId);
    });

    player.on('volumeChange', (guildId) => {
      void this.updateController(guildId);
    });

    player.on('loopChange', (guildId) => {
      void this.updateController(guildId);
    });

    player.on('filterChange', (guildId) => {
      void this.updateController(guildId);
    });

    player.on('queueCleared', (guildId) => {
      void this.updateController(guildId);
    });

    player.on('trackAdded', (guildId) => {
      void this.updateController(guildId);
    });

    player.on('tracksAdded', (guildId) => {
      void this.updateController(guildId);
    });

    player.on('queueShuffled', (guildId) => {
      void this.updateController(guildId);
    });

    player.on('error', async (guildId, error, track) => {
      console.error(
        `[MusicEmbedController] Playback error in guild ${guildId} for track "${track?.title ?? 'Unknown'}":`,
        error,
      );
      // Wait briefly for failure handling/skip to settle before refreshing UI
      setTimeout(() => {
        void this.updateController(guildId);
      }, 50);

      try {
        const musicChannelData = await this.services.musicRepo.getMusicChannel(guildId);
        if (musicChannelData) {
          const channel = await this.client.channels
            .fetch(musicChannelData.channelId)
            .catch(() => null);
          if (channel && 'send' in channel && typeof channel.send === 'function') {
            const trackTitle = track?.title ? `"${track.title}"` : 'the requested track';
            const tempMsg = await (channel as TextChannel)
              .send({
                content: `⚠️ Could not play ${trackTitle}: ${error.message || 'Stream unavailable'}. Skipping...`,
              })
              .catch(() => null);
            if (tempMsg) {
              setTimeout(() => {
                tempMsg.delete().catch(() => {});
              }, 7000);
            }
          }
        }
      } catch {
        // Ignore channel notification failure
      }
    });
  }

  /**
   * Updates or initializes the persistent controller message in the guild's music channel.
   * Debounced and serialized to prevent race conditions and Discord rate limits.
   */
  async updateController(guildId: string): Promise<void> {
    if (this.guildUpdating.has(guildId)) {
      this.guildUpdateQueued.add(guildId);
      return;
    }

    this.guildUpdating.add(guildId);

    try {
      // 50ms tick to coalesce rapid synchronous event bursts (e.g. trackAdded + trackStart + stateChange)
      await new Promise((r) => setTimeout(r, 50));
      await this.doUpdateController(guildId);
    } finally {
      this.guildUpdating.delete(guildId);
      if (this.guildUpdateQueued.has(guildId)) {
        this.guildUpdateQueued.delete(guildId);
        void this.updateController(guildId);
      }
    }
  }

  private async doUpdateController(guildId: string): Promise<void> {
    try {
      const musicChannelData = await this.services.musicRepo.getMusicChannel(guildId);
      if (!musicChannelData) return;

      const channel = await this.client.channels
        .fetch(musicChannelData.channelId)
        .catch(() => null);
      if (!channel || !('send' in channel) || !('messages' in channel)) return;

      const textChannel = channel as unknown as TextChannel;
      const queue = this.services.musicPlayer.getQueue(guildId);
      const totalTracks = (queue?.currentTrack ? 1 : 0) + (queue?.size ?? 0);

      const state: MusicEmbedState = {
        hasCurrentTrack: queue?.currentTrack !== null && queue?.currentTrack !== undefined,
        hasPrevious: (queue?.history.length ?? 0) > 0,
        hasNextTrack:
          (queue?.size ?? 0) > 0 || (queue?.loopMode === 'QUEUE' && Boolean(queue?.currentTrack)),
        isPaused: queue?.state === 'PAUSED',
        isMuted: (queue?.volume ?? 80) === 0,
        loopMode: queue?.loopMode ?? 'OFF',
        queueSize: totalTracks,
        canShuffle: (queue?.size ?? 0) >= 2,
      };

      const components = buildControllerButtonRows(state);
      const embed =
        queue && queue.currentTrack
          ? buildNowPlayingEmbed(queue.currentTrack, queue, queue.volume)
          : buildIdleEmbed();

      // Update channel topic if supported and permitted
      if ('setTopic' in textChannel && typeof textChannel.setTopic === 'function') {
        const topic =
          queue && queue.currentTrack
            ? `🎵 Now Playing: ${queue.currentTrack.title} (${formatDuration(queue.currentTrack.durationSeconds)})`
            : '🎵 Ririko Music Channel — Ready for song requests';
        textChannel.setTopic(topic).catch(() => {});
      }

      // If existing message ID recorded, attempt to edit in-place
      if (musicChannelData.lastMessageId) {
        let existingMessage: Message | null = null;
        try {
          existingMessage = await textChannel.messages.fetch(musicChannelData.lastMessageId);
        } catch (fetchErr: any) {
          // If code is not 10008 (Unknown Message), message still exists or temporary network error
          if (fetchErr?.code !== 10008 && fetchErr?.status !== 404) {
            console.error(
              `[MusicEmbedController] Temporary fetch error for message ${musicChannelData.lastMessageId}:`,
              fetchErr?.message || fetchErr,
            );
            return;
          }
        }

        if (existingMessage) {
          try {
            await existingMessage.edit({ embeds: [embed], components });
            return;
          } catch (editErr) {
            console.error(`[MusicEmbedController] Failed to edit controller message:`, editErr);
            return;
          }
        }
      }

      // Otherwise send new controller message and record ID only if truly missing/deleted
      const newMessage = await textChannel.send({ embeds: [embed], components });
      await this.services.musicRepo.setMusicChannel(guildId, textChannel.id, newMessage.id);
    } catch (err) {
      console.error(`[MusicEmbedController] Error updating controller for guild ${guildId}:`, err);
    }
  }

  /**
   * Sets up a dedicated music channel for a guild and deploys the controller embed.
   */
  async setupMusicChannel(guildId: string, channelId: string): Promise<Message> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !('send' in channel)) {
      throw new Error('Target channel is not a valid text-based channel.');
    }

    const textChannel = channel as unknown as TextChannel;
    const queue = this.services.musicPlayer.getQueue(guildId);
    const totalTracks = (queue?.currentTrack ? 1 : 0) + (queue?.size ?? 0);

    const state: MusicEmbedState = {
      hasCurrentTrack: queue?.currentTrack !== null && queue?.currentTrack !== undefined,
      hasPrevious: (queue?.history.length ?? 0) > 0,
      hasNextTrack:
        (queue?.size ?? 0) > 0 || (queue?.loopMode === 'QUEUE' && Boolean(queue?.currentTrack)),
      isPaused: queue?.state === 'PAUSED',
      isMuted: (queue?.volume ?? 80) === 0,
      loopMode: queue?.loopMode ?? 'OFF',
      queueSize: totalTracks,
      canShuffle: (queue?.size ?? 0) >= 2,
    };

    const embed =
      queue && queue.currentTrack
        ? buildNowPlayingEmbed(queue.currentTrack, queue, queue.volume)
        : buildIdleEmbed();
    const components = buildControllerButtonRows(state);

    const message = await textChannel.send({ embeds: [embed], components });
    await this.services.musicRepo.setMusicChannel(guildId, channelId, message.id);

    if ('setTopic' in textChannel && typeof textChannel.setTopic === 'function') {
      textChannel.setTopic('🎵 Ririko Music Channel — Ready for song requests').catch(() => {});
    }

    return message;
  }

  /**
   * Handles incoming messages in dedicated music channels:
   * Deletes user chat message and automatically begins playback if the user is in a voice channel.
   */
  async handleMusicChannelMessage(message: Message): Promise<boolean> {
    if (message.author.bot || !message.guild) return false;

    const guildId = message.guild.id;
    const musicChannel = await this.services.musicRepo.getMusicChannel(guildId);
    if (!musicChannel || musicChannel.channelId !== message.channelId) {
      return false; // Not the dedicated music channel
    }

    // Attempt to delete message to maintain clean controller interface
    message.delete().catch(() => {});

    const rawContent = message.content.trim();
    if (!rawContent) return true;

    // Normalize input: strip angle brackets Discord wraps around URLs e.g. <https://...>
    const query = rawContent.replace(/^<([\s\S]*)>$/, '$1').trim();
    if (!query) return true;

    const member = message.member;
    const voiceChannelId = member?.voice.channelId;

    if (!('send' in message.channel) || typeof message.channel.send !== 'function') {
      return true;
    }
    const sendable = message.channel as unknown as {
      send: (options: unknown) => Promise<Message>;
    };

    if (!voiceChannelId) {
      const warn = await sendable
        .send({
          content: `⚠️ <@${message.author.id}>, please join a voice channel first to play music!`,
        })
        .catch(() => null);

      if (warn) {
        setTimeout(() => {
          warn.delete().catch(() => {});
        }, 5000);
      }
      return true;
    }

    // Play query
    try {
      await this.services.musicPlayer.play({
        guildId,
        voiceChannelId,
        textChannelId: message.channelId,
        query,
        member: {
          id: message.author.id,
          username: message.author.username,
          avatarUrl: message.author.displayAvatarURL
            ? message.author.displayAvatarURL({ extension: 'png', size: 128 })
            : undefined,
        },
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      // Refresh controller embed immediately so new tracks/state reflect in UI
      void this.updateController(guildId);
    } catch (err) {
      const errWarn = await sendable
        .send({
          content: `❌ Could not play query: ${err instanceof Error ? err.message : String(err)}`,
        })
        .catch(() => null);

      if (errWarn) {
        setTimeout(() => {
          errWarn.delete().catch(() => {});
        }, 5000);
      }
    }

    return true;
  }

  /**
   * Handles interactive button clicks from the music controller component rows.
   */
  async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith('music_')) return;

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: '⚠️ This button can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const member = interaction.member;
    const voiceChannelId =
      member && 'voice' in member && member.voice && typeof member.voice === 'object'
        ? (member.voice as { channelId: string | null }).channelId
        : null;

    // Check voice channel connection
    if (!voiceChannelId) {
      await interaction.reply({
        content: '⚠️ You must join a voice channel to use music controls!',
        ephemeral: true,
      });
      return;
    }

    const queue = this.services.musicPlayer.getQueue(guildId);
    const customId = interaction.customId;

    switch (customId) {
      case 'music_previous': {
        const backed = this.services.musicPlayer.previous(guildId);
        if (!backed) {
          await interaction.reply({
            content: '⚠️ No previous track available in history.',
            ephemeral: true,
          });
          return;
        }
        await interaction.deferUpdate();
        await this.updateController(guildId);
        break;
      }

      case 'music_play_pause': {
        if (!queue || !queue.currentTrack) {
          await interaction.reply({ content: '⚠️ Nothing is currently playing.', ephemeral: true });
          return;
        }

        if (this.services.musicPlayer.isPlaying(guildId)) {
          this.services.musicPlayer.pause(guildId);
        } else {
          this.services.musicPlayer.resume(guildId);
        }
        await interaction.deferUpdate();
        await this.updateController(guildId);
        break;
      }

      case 'music_skip': {
        const skipped = this.services.musicPlayer.skip(guildId);
        if (!skipped) {
          await interaction.reply({ content: '⚠️ No track available to skip.', ephemeral: true });
          return;
        }
        await interaction.deferUpdate();
        await this.updateController(guildId);
        break;
      }

      case 'music_stop': {
        this.services.musicPlayer.stop(guildId);
        await interaction.deferUpdate();
        await this.updateController(guildId);
        break;
      }

      case 'music_mute_unmute': {
        if (!queue) {
          await interaction.reply({ content: '⚠️ No active music queue.', ephemeral: true });
          return;
        }
        if (queue.volume > 0) {
          this.guildPreviousVolumes.set(guildId, queue.volume);
          queue.setVolume(0);
        } else {
          const restored = this.guildPreviousVolumes.get(guildId) ?? 80;
          queue.setVolume(restored);
        }
        await interaction.deferUpdate();
        await this.updateController(guildId);
        break;
      }

      case 'music_loop': {
        if (!queue) {
          await interaction.reply({ content: '⚠️ No active music queue.', ephemeral: true });
          return;
        }
        const nextMode =
          queue.loopMode === 'OFF' ? 'TRACK' : queue.loopMode === 'TRACK' ? 'QUEUE' : 'OFF';
        this.services.musicPlayer.setLoopMode(guildId, nextMode);
        await interaction.deferUpdate();
        await this.updateController(guildId);
        break;
      }

      case 'music_shuffle': {
        const shuffled = this.services.musicPlayer.shuffle(guildId);
        if (!shuffled) {
          await interaction.reply({
            content: '⚠️ Need at least 2 tracks in queue to shuffle.',
            ephemeral: true,
          });
          return;
        }
        await interaction.deferUpdate();
        await this.updateController(guildId);
        break;
      }

      case 'music_lyrics': {
        const track = queue?.currentTrack;
        if (!track) {
          await interaction.reply({ content: '⚠️ Nothing is currently playing.', ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });
        const lyricsEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📝 Lyrics: ${track.title}`)
          .setDescription(
            `*Lyrics search for [${track.title}](${track.url})*\n\n*(Full dynamic lyrics available via \`/lyrics\` command)*`,
          )
          .setFooter({ text: 'Ririko Music 2.0 • Lyrics' });

        await interaction.editReply({ embeds: [lyricsEmbed] });
        break;
      }

      case 'music_queue': {
        const totalTracks = (queue?.currentTrack ? 1 : 0) + (queue?.size ?? 0);
        if (!queue || totalTracks === 0) {
          await interaction.reply({
            content: '📜 The music queue is currently empty.',
            ephemeral: true,
          });
          return;
        }

        let description = '';
        if (queue.currentTrack) {
          description += `▶️ **Now Playing:**\n🎶 **[${queue.currentTrack.title}](${queue.currentTrack.url})** (\`${formatDuration(queue.currentTrack.durationSeconds)}\`) - <@${queue.currentTrack.requestedBy?.id ?? 'Unknown'}>`;
        }

        if (queue.tracks.length > 0) {
          const upcoming = queue.tracks.slice(0, 10);
          const queueList = upcoming
            .map(
              (t, i) =>
                `\`${i + 1}.\` **[${t.title}](${t.url})** (\`${formatDuration(t.durationSeconds)}\`) - <@${t.requestedBy?.id ?? 'Unknown'}>`,
            )
            .join('\n');
          description += `${description ? '\n\n' : ''}**Upcoming Tracks:**\n${queueList}`;
          if (queue.tracks.length > 10) {
            description += `\n*...and ${queue.tracks.length - 10} more*`;
          }
        } else {
          description += '\n\n*(No upcoming tracks in queue)*';
        }

        const queueEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📜 Current Queue (${totalTracks} ${totalTracks === 1 ? 'track' : 'tracks'})`)
          .setDescription(description)
          .setFooter({
            text: `Total: ${totalTracks} ${totalTracks === 1 ? 'track' : 'tracks'} | Total Duration: ${formatDuration(queue.totalDurationSeconds)} | Loop: ${queue.loopMode}`,
          });

        await interaction.reply({ embeds: [queueEmbed], ephemeral: true });
        break;
      }

      case 'music_refresh': {
        await interaction.deferUpdate();
        await this.updateController(guildId);
        break;
      }

      default:
        break;
    }
  }
}
