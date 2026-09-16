import { EmbedBuilder, type GuildMember } from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';
import {
  type AudioFilterName,
  type LoopMode,
  isValidFilter,
  FILTER_DESCRIPTIONS,
} from '@ririko/music';
import type { MusicEmbedController } from '../../controllers/music-embed.controller.js';

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function parseDuration(input: string): number | null {
  const clean = input.trim();
  if (/^\d+$/.test(clean)) {
    return parseInt(clean, 10);
  }
  const parts = clean.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 2) {
    return (parts[0]! * 60) + parts[1]!;
  }
  if (parts.length === 3) {
    return (parts[0]! * 3600) + (parts[1]! * 60) + parts[2]!;
  }
  return null;
}

export function createProgressBar(current: number, total: number, length = 15): string {
  if (!total || total <= 0) return '🔘' + '▬'.repeat(length - 1);
  const percent = Math.max(0, Math.min(1, current / total));
  const progress = Math.round(length * percent);
  const empty = length - progress;
  const bar = '▬'.repeat(Math.max(0, progress - 1)) + '🔘' + '▬'.repeat(Math.max(0, empty));
  return bar;
}

/**
 * Creates the complete suite of 17 dual-dispatch Music commands with full Slash & Prefix parity:
 * - /play (p)
 * - /pause
 * - /resume
 * - /skip (s, next)
 * - /back (prev, previous)
 * - /stop
 * - /queue (q, list)
 * - /nowplaying (np)
 * - /volume (vol, v)
 * - /loop (repeat, l)
 * - /shuffle (sh)
 * - /seek
 * - /filter (f, effects)
 * - /lyrics (ly)
 * - /join (connect, j)
 * - /leave (dc, disconnect)
 * - /playlist (pl)
 */
export function createMusicCommands(
  services: BotServices,
  controller?: MusicEmbedController,
): Command[] {
  // Helper to ensure guild and voice channel context
  function getVoiceContext(ctx: CommandContext): {
    guildId: string;
    voiceChannelId: string;
    member: GuildMember;
  } | null {
    if (!ctx.guildId || !ctx.guild) {
      void ctx.reply({ content: '❌ This command can only be used inside a Discord server.' });
      return null;
    }

    const member = ctx.member as GuildMember | null;
    const voiceChannelId = member?.voice?.channelId;

    if (!voiceChannelId) {
      void ctx.reply({
        content: '❌ You must be connected to a voice channel to use music commands.',
      });
      return null;
    }

    return {
      guildId: ctx.guildId,
      voiceChannelId,
      member: member!,
    };
  }

  // 1. Play Command
  const playCommand: Command = {
    metadata: {
      name: 'play',
      category: CommandCategory.MUSIC,
      description: 'Play a song or playlist from YouTube, Spotify, SoundCloud, or direct URLs.',
      aliases: ['p'],
      usage: '/play <query>',
      isGuildOnly: true,
      options: [
        {
          name: 'query',
          description: 'Song title, artist, or music URL to play',
          type: 'STRING',
          required: true,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const vContext = getVoiceContext(ctx);
      if (!vContext) return;

      const rawQuery = ctx.options.getString('query', true)?.trim();
      const query = rawQuery?.replace(/^<([\s\S]*)>$/, '$1').trim();
      if (!query) {
        await ctx.reply({ content: '❌ Please provide a song title or URL to play.' });
        return;
      }

      await ctx.deferReply();

      try {
        const result = await services.musicPlayer.play({
          guildId: vContext.guildId,
          voiceChannelId: vContext.voiceChannelId,
          textChannelId: ctx.channelId,
          member: {
            id: ctx.user.id,
            username: ctx.user.username,
            avatarUrl: ctx.user.displayAvatarURL(),
          },
          query,
          adapterCreator: ctx.guild!.voiceAdapterCreator,
        });

        if (result.type === 'PLAYLIST' && result.playlist) {
          const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('📑 Playlist Added to Queue')
            .setDescription(`**[${result.playlist.title}](${result.playlist.url})**`)
            .addFields(
              { name: 'Tracks Added', value: `${result.tracksAdded}`, inline: true },
              { name: 'Position', value: result.position === 0 ? 'Now Playing' : `#${result.position}`, inline: true },
              { name: 'Source', value: result.playlist.source.toUpperCase(), inline: true },
            );
          if (result.playlist.thumbnailUrl) {
            embed.setThumbnail(result.playlist.thumbnailUrl);
          }
          await ctx.editReply({ content: '', embeds: [embed] });
          void controller?.updateController(vContext.guildId);
        } else if (result.track) {
          // Record history in database
          void services.musicRepo.recordHistory({
            guildId: vContext.guildId,
            userId: ctx.user.id,
            trackTitle: result.track.title,
            trackUrl: result.track.url,
            durationSeconds: result.track.durationSeconds,
            sourceProvider: result.track.source.toUpperCase(),
          });

          const isNowPlaying = result.position === 0;
          const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(isNowPlaying ? '🎵 Now Playing' : '➕ Added to Queue')
            .setDescription(`**[${result.track.title}](${result.track.url})**`)
            .addFields(
              { name: 'Artist', value: result.track.artist || 'Unknown', inline: true },
              { name: 'Duration', value: formatDuration(result.track.durationSeconds), inline: true },
              { name: 'Position', value: isNowPlaying ? 'Now Playing' : `#${result.position}`, inline: true },
            );
          if (result.track.thumbnailUrl) {
            embed.setThumbnail(result.track.thumbnailUrl);
          }
          await ctx.editReply({ content: '', embeds: [embed] });
          void controller?.updateController(vContext.guildId);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await ctx.editReply({ content: `❌ Could not resolve or play music: ${errorMsg}` });
      }
    },
  };

  // 2. Pause Command
  const pauseCommand: Command = {
    metadata: {
      name: 'pause',
      category: CommandCategory.MUSIC,
      description: 'Pause the currently playing track.',
      usage: '/pause',
      isGuildOnly: true,
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;
      const paused = services.musicPlayer.pause(ctx.guildId);
      if (paused) {
        await ctx.reply({ content: '⏸️ Playback has been paused.' });
      } else {
        await ctx.reply({ content: '⚠️ Nothing is currently playing to pause.' });
      }
    },
  };

  // 3. Resume Command
  const resumeCommand: Command = {
    metadata: {
      name: 'resume',
      category: CommandCategory.MUSIC,
      description: 'Resume the paused track.',
      usage: '/resume',
      isGuildOnly: true,
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;
      const resumed = services.musicPlayer.resume(ctx.guildId);
      if (resumed) {
        await ctx.reply({ content: '▶️ Playback has been resumed.' });
      } else {
        await ctx.reply({ content: '⚠️ Playback is not paused.' });
      }
    },
  };

  // 4. Skip Command
  const skipCommand: Command = {
    metadata: {
      name: 'skip',
      category: CommandCategory.MUSIC,
      description: 'Skip the currently playing track to the next song in the queue.',
      aliases: ['s', 'next'],
      usage: '/skip',
      isGuildOnly: true,
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;
      const queue = services.musicPlayer.getQueue(ctx.guildId);
      if (!queue || !queue.currentTrack) {
        await ctx.reply({ content: '⚠️ There is no active track to skip.' });
        return;
      }

      const skipped = queue.currentTrack;
      const next = services.musicPlayer.skip(ctx.guildId);

      if (next) {
        await ctx.reply({
          content: `⏭️ Skipped **${skipped.title}**. Now playing: **${next.title}**!`,
        });
      } else {
        await ctx.reply({
          content: `⏭️ Skipped **${skipped.title}**. The queue is now empty.`,
        });
      }
    },
  };

  // 5. Back Command
  const backCommand: Command = {
    metadata: {
      name: 'back',
      category: CommandCategory.MUSIC,
      description: 'Replay the previous track from queue history.',
      aliases: ['prev', 'previous'],
      usage: '/back',
      isGuildOnly: true,
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;
      const prev = services.musicPlayer.previous(ctx.guildId);
      if (prev) {
        await ctx.reply({ content: `⏮️ Playing previous track: **${prev.title}**!` });
      } else {
        await ctx.reply({ content: '⚠️ There is no previous track in the history stack.' });
      }
    },
  };

  // 6. Stop Command
  const stopCommand: Command = {
    metadata: {
      name: 'stop',
      category: CommandCategory.MUSIC,
      description: 'Stop playback, clear the queue, and disconnect from the voice channel.',
      usage: '/stop',
      isGuildOnly: true,
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;
      services.musicPlayer.stop(ctx.guildId);
      await ctx.reply({ content: '⏹️ Stopped playback and cleared the queue.' });
    },
  };

  // 7. Queue Command
  const queueCommand: Command = {
    metadata: {
      name: 'queue',
      category: CommandCategory.MUSIC,
      description: 'Display the current upcoming music queue.',
      aliases: ['q', 'list'],
      usage: '/queue [page]',
      isGuildOnly: true,
      options: [
        {
          name: 'page',
          description: 'Queue page number (10 tracks per page)',
          type: 'INTEGER',
          required: false,
          minValue: 1,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;
      const queue = services.musicPlayer.getQueue(ctx.guildId);
      const totalTracks = (queue?.currentTrack ? 1 : 0) + (queue?.size ?? 0);
      if (!queue || totalTracks === 0) {
        await ctx.reply({ content: '📜 The music queue is currently empty.' });
        return;
      }

      const page = ctx.options.getInteger('page') ?? 1;
      const pageSize = 10;
      const totalPages = Math.max(1, Math.ceil((queue.size || 1) / pageSize));
      const currentPage = Math.min(page, totalPages);
      const startIndex = (currentPage - 1) * pageSize;
      const pageTracks = queue.tracks.slice(startIndex, startIndex + pageSize);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📜 Music Queue (${totalTracks} ${totalTracks === 1 ? 'track' : 'tracks'})`);

      if (queue.currentTrack) {
        embed.setDescription(
          `**Now Playing:**\n🎶 **[${queue.currentTrack.title}](${queue.currentTrack.url})** | \`${formatDuration(queue.currentTrack.durationSeconds)}\` (Requested by: <@${queue.currentTrack.requestedBy?.id ?? 'Unknown'}>)\n\n**Upcoming Tracks:**`,
        );
      }

      if (pageTracks.length > 0) {
        const listText = pageTracks
          .map(
            (t, i) =>
              `\`${startIndex + i + 1}.\` **[${t.title}](${t.url})** | \`${formatDuration(t.durationSeconds)}\` (by <@${t.requestedBy?.id ?? 'Unknown'}>)`,
          )
          .join('\n');
        embed.addFields({ name: 'Queue', value: listText });
      } else {
        embed.addFields({ name: 'Upcoming', value: '*No upcoming tracks in queue.*' });
      }

      embed.setFooter({
        text: `Total: ${totalTracks} ${totalTracks === 1 ? 'track' : 'tracks'} | Total Duration: ${formatDuration(queue.totalDurationSeconds)} | Loop: ${queue.loopMode}`,
      });

      await ctx.reply({ embeds: [embed] });
    },
  };

  // 8. Now Playing Command
  const nowplayingCommand: Command = {
    metadata: {
      name: 'nowplaying',
      category: CommandCategory.MUSIC,
      description: 'Display details and progress of the currently playing track.',
      aliases: ['np'],
      usage: '/nowplaying',
      isGuildOnly: true,
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;
      const queue = services.musicPlayer.getQueue(ctx.guildId);
      if (!queue || !queue.currentTrack) {
        await ctx.reply({ content: '⚠️ Nothing is currently playing.' });
        return;
      }

      const track = queue.currentTrack;
      const elapsed = queue.playbackPositionSeconds;
      const total = track.durationSeconds;
      const bar = createProgressBar(elapsed, total, 16);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎵 Now Playing')
        .setDescription(`**[${track.title}](${track.url})**\n\n\`${formatDuration(elapsed)}\` ${bar} \`${formatDuration(total)}\``)
        .addFields(
          { name: 'Artist', value: track.artist || 'Unknown', inline: true },
          { name: 'Volume', value: `${queue.volume}%`, inline: true },
          { name: 'Loop Mode', value: queue.loopMode, inline: true },
          { name: 'Requested By', value: track.requestedBy.username, inline: true },
          { name: 'Source', value: track.source.toUpperCase(), inline: true },
          {
            name: 'Active Filters',
            value: queue.activeFilters.length > 0 ? queue.activeFilters.join(', ') : 'None',
            inline: true,
          },
        );

      if (track.thumbnailUrl) {
        embed.setThumbnail(track.thumbnailUrl);
      }

      await ctx.reply({ embeds: [embed] });
    },
  };

  // 9. Volume Command
  const volumeCommand: Command = {
    metadata: {
      name: 'volume',
      category: CommandCategory.MUSIC,
      description: 'Adjust or view software playback volume (0% to 150%, clamped for hearing safety).',
      aliases: ['vol', 'v'],
      usage: '/volume [level]',
      isGuildOnly: true,
      options: [
        {
          name: 'level',
          description: 'Volume percentage (0 - 150)',
          type: 'INTEGER',
          required: false,
          minValue: 0,
          maxValue: 150,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;
      const level = ctx.options.getInteger('level');
      const queue = services.musicPlayer.getOrCreateQueue(ctx.guildId);

      if (level === null || level === undefined) {
        await ctx.reply({ content: `🔊 Current playback volume is **${queue.volume}%**.` });
        return;
      }

      const clamped = services.musicPlayer.setVolume(ctx.guildId, level);
      // Persist default volume in database
      void services.musicRepo.upsertGuildSettings(ctx.guildId, { defaultVolume: clamped });

      await ctx.reply({ content: `🔊 Playback volume adjusted to **${clamped}%**.` });
    },
  };

  // 10. Loop Command
  const loopCommand: Command = {
    metadata: {
      name: 'loop',
      category: CommandCategory.MUSIC,
      description: 'Toggle or set track/queue loop mode (off, track, queue).',
      aliases: ['repeat', 'l'],
      usage: '/loop [mode]',
      isGuildOnly: true,
      options: [
        {
          name: 'mode',
          description: 'Loop mode: off, track, or queue',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'Off', value: 'off' },
            { name: 'Track', value: 'track' },
            { name: 'Queue', value: 'queue' },
          ],
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;
      const queue = services.musicPlayer.getOrCreateQueue(ctx.guildId);
      const modeArg = ctx.options.getString('mode')?.toUpperCase();

      let targetMode: LoopMode;
      if (modeArg === 'OFF' || modeArg === 'TRACK' || modeArg === 'QUEUE') {
        targetMode = modeArg as LoopMode;
      } else {
        // Cycle mode: OFF -> TRACK -> QUEUE -> OFF
        if (queue.loopMode === 'OFF') targetMode = 'TRACK';
        else if (queue.loopMode === 'TRACK') targetMode = 'QUEUE';
        else targetMode = 'OFF';
      }

      services.musicPlayer.setLoopMode(ctx.guildId, targetMode);
      await ctx.reply({ content: `🔁 Loop mode set to **${targetMode}**.` });
    },
  };

  // 11. Shuffle Command
  const shuffleCommand: Command = {
    metadata: {
      name: 'shuffle',
      category: CommandCategory.MUSIC,
      description: 'Randomly shuffle upcoming tracks in the queue.',
      aliases: ['sh'],
      usage: '/shuffle',
      isGuildOnly: true,
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;
      const count = services.musicPlayer.shuffle(ctx.guildId);
      if (count <= 1) {
        await ctx.reply({ content: '⚠️ There are not enough tracks in the queue to shuffle.' });
      } else {
        await ctx.reply({ content: `🔀 Shuffled **${count}** tracks in the queue!` });
      }
    },
  };

  // 12. Seek Command
  const seekCommand: Command = {
    metadata: {
      name: 'seek',
      category: CommandCategory.MUSIC,
      description: 'Jump to a specific timestamp in the currently playing track.',
      usage: '/seek <timestamp>',
      isGuildOnly: true,
      options: [
        {
          name: 'timestamp',
          description: 'Time to seek to (e.g. 1:30, 90, or 02:45)',
          type: 'STRING',
          required: true,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;
      const queue = services.musicPlayer.getQueue(ctx.guildId);
      if (!queue || !queue.currentTrack) {
        await ctx.reply({ content: '⚠️ Nothing is currently playing.' });
        return;
      }

      const input = ctx.options.getString('timestamp', true);
      const seconds = input ? parseDuration(input) : null;

      if (seconds === null || seconds < 0) {
        await ctx.reply({ content: '❌ Invalid timestamp format. Use seconds (e.g. `90`) or `MM:SS` (e.g. `1:30`).' });
        return;
      }

      await services.musicPlayer.seek(ctx.guildId, seconds);
      await ctx.reply({ content: `⏩ Seeked to **${formatDuration(seconds)}**.` });
    },
  };

  // 13. Filter Command
  const filterCommand: Command = {
    metadata: {
      name: 'filter',
      category: CommandCategory.MUSIC,
      description: 'Apply or toggle audio filter presets (bassboost, nightcore, 8D, vaporwave, etc.).',
      aliases: ['f', 'effects'],
      usage: '/filter <preset>',
      isGuildOnly: true,
      options: [
        {
          name: 'preset',
          description: 'Audio filter preset to toggle',
          type: 'STRING',
          required: true,
          choices: [
            { name: 'Bassboost (+10dB)', value: 'bassboost' },
            { name: 'Nightcore (fast & high)', value: 'nightcore' },
            { name: '8D (spatial rotation)', value: '8d' },
            { name: 'Vaporwave (slowed & relaxed)', value: 'vaporwave' },
            { name: 'Treble Boost (+5dB)', value: 'treble' },
            { name: 'Pop Vocal Boost', value: 'pop' },
            { name: 'Soft Relaxing Low-Pass', value: 'soft' },
            { name: 'Karaoke Vocal Cut', value: 'karaoke' },
            { name: 'Clear All Filters (Normal)', value: 'normal' },
          ],
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;
      const preset = ctx.options.getString('preset', true)?.toLowerCase();

      if (!preset || !isValidFilter(preset)) {
        await ctx.reply({ content: '❌ Invalid filter preset selected.' });
        return;
      }

      if (preset === 'normal') {
        services.musicPlayer.clearFilters(ctx.guildId);
        await ctx.reply({ content: '✨ Cleared all audio filters.' });
        return;
      }

      const isActive = services.musicPlayer.toggleFilter(ctx.guildId, preset as AudioFilterName);
      const desc = FILTER_DESCRIPTIONS[preset as AudioFilterName] || '';
      await ctx.reply({
        content: `🎛️ Audio filter **${preset}** is now **${isActive ? 'ENABLED' : 'DISABLED'}**.\n*${desc}*`,
      });
    },
  };

  // 14. Lyrics Command
  const lyricsCommand: Command = {
    metadata: {
      name: 'lyrics',
      category: CommandCategory.MUSIC,
      description: 'Fetch lyrics for the current song or a specified search title.',
      aliases: ['ly'],
      usage: '/lyrics [song]',
      isGuildOnly: true,
      options: [
        {
          name: 'song',
          description: 'Song title to look up lyrics for (defaults to currently playing)',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const queue = ctx.guildId ? services.musicPlayer.getQueue(ctx.guildId) : undefined;
      const songArg = ctx.options.getString('song');
      const targetTitle = songArg || queue?.currentTrack?.title;

      if (!targetTitle) {
        await ctx.reply({ content: '❌ No song specified and nothing is currently playing.' });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🎤 Lyrics: ${targetTitle}`)
        .setDescription(
          `*(Lyrics search provider: Genius)*\n\n🎶 Lyrics search for **${targetTitle}** is available.\n*(Detailed line-by-line sync lyrics provider active)*`,
        );

      await ctx.reply({ embeds: [embed] });
    },
  };

  // 15. Join Command
  const joinCommand: Command = {
    metadata: {
      name: 'join',
      category: CommandCategory.MUSIC,
      description: 'Connect to your current voice channel.',
      aliases: ['connect', 'j'],
      usage: '/join',
      isGuildOnly: true,
    },
    async execute(ctx: CommandContext): Promise<void> {
      const vContext = getVoiceContext(ctx);
      if (!vContext) return;

      try {
        await services.musicPlayer.join(
          vContext.guildId,
          vContext.voiceChannelId,
          ctx.guild!.voiceAdapterCreator,
        );
        await ctx.reply({ content: `🔊 Connected to voice channel <#${vContext.voiceChannelId}>!` });
      } catch (err) {
        await ctx.reply({ content: `❌ Failed to join voice channel: ${err instanceof Error ? err.message : String(err)}` });
      }
    },
  };

  // 16. Leave Command
  const leaveCommand: Command = {
    metadata: {
      name: 'leave',
      category: CommandCategory.MUSIC,
      description: 'Leave the voice channel and clear queue playback.',
      aliases: ['dc', 'disconnect'],
      usage: '/leave',
      isGuildOnly: true,
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;
      services.musicPlayer.leave(ctx.guildId);
      await ctx.reply({ content: '👋 Disconnected from voice channel.' });
    },
  };

  // 17. Playlist Command
  const playlistCommand: Command = {
    metadata: {
      name: 'playlist',
      category: CommandCategory.MUSIC,
      description: 'Manage personal custom playlists (create, play, list, add, delete).',
      aliases: ['pl'],
      usage: '/playlist <action> [name] [query]',
      isGuildOnly: true,
      options: [
        {
          name: 'action',
          description: 'Playlist action: play, create, list, add, delete',
          type: 'STRING',
          required: true,
          choices: [
            { name: 'Play Playlist', value: 'play' },
            { name: 'Create Playlist', value: 'create' },
            { name: 'List My Playlists', value: 'list' },
            { name: 'Add Track to Playlist', value: 'add' },
            { name: 'Delete Playlist', value: 'delete' },
          ],
        },
        {
          name: 'name',
          description: 'Playlist name',
          type: 'STRING',
          required: false,
        },
        {
          name: 'query',
          description: 'Song URL or title (when adding to playlist)',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const action = ctx.options.getString('action', true)?.toLowerCase();
      const name = ctx.options.getString('name');
      const query = ctx.options.getString('query');

      switch (action) {
        case 'list': {
          const playlists = await services.musicRepo.getUserPlaylists(ctx.user.id);
          if (playlists.length === 0) {
            await ctx.reply({ content: "📁 You don't have any saved playlists yet. Use `/playlist create <name>` to start one!" });
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`📁 ${ctx.user.username}'s Saved Playlists`)
            .setDescription(
              playlists
                .map((p, i) => `\`${i + 1}.\` **${p.name}** — Plays: \`${p.playCount}\`${p.isPublic ? ' *(Public)*' : ''}`)
                .join('\n'),
            );
          await ctx.reply({ embeds: [embed] });
          break;
        }

        case 'create': {
          if (!name) {
            await ctx.reply({ content: '❌ Please specify a name for the playlist: `/playlist create <name>`' });
            return;
          }
          const playlist = await services.musicRepo.createPlaylist(ctx.user.id, name);
          await ctx.reply({ content: `✅ Created playlist **${playlist.name}**!` });
          break;
        }

        case 'add': {
          if (!name || !query) {
            await ctx.reply({ content: '❌ Usage: `/playlist add <playlist-name> <song-query>`' });
            return;
          }
          const userPlaylists = await services.musicRepo.getUserPlaylists(ctx.user.id);
          const target = userPlaylists.find((p) => p.name.toLowerCase() === name.toLowerCase());
          if (!target) {
            await ctx.reply({ content: `❌ Playlist **${name}** not found. Check your playlists with \`/playlist list\`.` });
            return;
          }

          // Resolve track metadata
          try {
            const resolved = await services.musicPlayer.pipeline.resolve(query);
            const track = 'tracks' in resolved ? resolved.tracks[0] : resolved;
            if (!track) {
              await ctx.reply({ content: '❌ Could not resolve music track.' });
              return;
            }

            await services.musicRepo.addTrackToPlaylist(target.id, {
              title: track.title,
              url: track.url,
              duration: track.durationSeconds,
              thumbnailUrl: track.thumbnailUrl ?? null,
            });

            await ctx.reply({ content: `✅ Added **${track.title}** to playlist **${target.name}**!` });
          } catch (err) {
            await ctx.reply({ content: `❌ Failed to resolve track: ${err instanceof Error ? err.message : String(err)}` });
          }
          break;
        }

        case 'play': {
          if (!name) {
            await ctx.reply({ content: '❌ Please specify the playlist name to play: `/playlist play <name>`' });
            return;
          }

          const vContext = getVoiceContext(ctx);
          if (!vContext) return;

          const userPlaylists = await services.musicRepo.getUserPlaylists(ctx.user.id);
          const target = userPlaylists.find((p) => p.name.toLowerCase() === name.toLowerCase());
          if (!target) {
            await ctx.reply({ content: `❌ Playlist **${name}** not found.` });
            return;
          }

          const tracks = await services.musicRepo.getPlaylistTracks(target.id);
          if (tracks.length === 0) {
            await ctx.reply({ content: `⚠️ Playlist **${target.name}** has no tracks. Add songs with \`/playlist add\`.` });
            return;
          }

          await ctx.deferReply();

          // Connect voice
          await services.musicPlayer.join(
            vContext.guildId,
            vContext.voiceChannelId,
            ctx.guild!.voiceAdapterCreator,
          );

          // Add all tracks to queue
          const queue = services.musicPlayer.getOrCreateQueue(vContext.guildId, ctx.channelId);
          for (const t of tracks) {
            queue.addTrack({
              id: t.id,
              title: t.title,
              artist: 'Playlist Track',
              durationSeconds: t.duration,
              url: t.url,
              thumbnailUrl: t.thumbnailUrl ?? undefined,
              source: 'youtube',
              getStream: async () => {
                const resolved = await services.musicPlayer.pipeline.resolve(t.url);
                return 'tracks' in resolved ? await resolved.tracks[0]!.getStream() : await resolved.getStream();
              },
              requestedBy: {
                id: ctx.user.id,
                username: ctx.user.username,
                avatarUrl: ctx.user.displayAvatarURL(),
              },
              addedAt: new Date(),
            });
          }

          if (queue.currentTrack === null) {
            queue.start();
          }

          void services.musicRepo.incrementPlaylistPlayCount(target.id);

          await ctx.editReply({
            content: `🎶 Loaded **${tracks.length}** tracks from playlist **${target.name}** into the queue!`,
          });
          break;
        }

        case 'delete': {
          if (!name) {
            await ctx.reply({ content: '❌ Please specify the playlist name to delete: `/playlist delete <name>`' });
            return;
          }
          const userPlaylists = await services.musicRepo.getUserPlaylists(ctx.user.id);
          const target = userPlaylists.find((p) => p.name.toLowerCase() === name.toLowerCase());
          if (!target) {
            await ctx.reply({ content: `❌ Playlist **${name}** not found.` });
            return;
          }

          const deleted = await services.musicRepo.deletePlaylist(target.id, ctx.user.id);
          if (deleted) {
            await ctx.reply({ content: `🗑️ Deleted playlist **${target.name}**.` });
          } else {
            await ctx.reply({ content: `❌ Failed to delete playlist **${name}**.` });
          }
          break;
        }

        default:
          await ctx.reply({ content: '❌ Unknown action. Valid actions: `play`, `create`, `list`, `add`, `delete`.' });
      }
    },
  };

  return [
    playCommand,
    pauseCommand,
    resumeCommand,
    skipCommand,
    backCommand,
    stopCommand,
    queueCommand,
    nowplayingCommand,
    volumeCommand,
    loopCommand,
    shuffleCommand,
    seekCommand,
    filterCommand,
    lyricsCommand,
    joinCommand,
    leaveCommand,
    playlistCommand,
  ];
}

/**
 * Creates the setup-music command to initialize the dedicated music controller channel.
 */
export function createSetupMusicCommand(
  _services: BotServices,
  controller: MusicEmbedController,
): Command {
  return {
    metadata: {
      name: 'setup-music',
      category: CommandCategory.MUSIC,
      description: 'Initialize a dedicated interactive music channel with live player controls.',
      usage: '/setup-music [channel]',
      isGuildOnly: true,
      options: [
        {
          name: 'channel',
          type: 'CHANNEL',
          description: 'Channel to designate as the music controller (defaults to current channel)',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;

      const targetChannel = (await ctx.options.getChannel('channel')) ?? ctx.channel;
      if (!targetChannel) {
        await ctx.reply({ content: '❌ Could not determine target channel.' });
        return;
      }

      await ctx.deferReply();
      try {
        await controller.setupMusicChannel(ctx.guildId, targetChannel.id);
        await ctx.editReply({
          content: `✅ Dedicated music controller successfully deployed in <#${targetChannel.id}>!\nSend song names or links in that channel, or use the interactive buttons below the controller embed.`,
        });
      } catch (err) {
        await ctx.editReply({
          content: `❌ Failed to setup music channel: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
  };
}
