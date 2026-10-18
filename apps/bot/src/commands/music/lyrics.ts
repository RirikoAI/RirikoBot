import { EmbedBuilder } from 'discord.js';
import { PrecisionTrackMatcher } from '@ririko/music';
import type { LrclibLyrics, LrclibTrackQuery } from '@ririko/services';
import type { BotServices } from '../../services.js';

/** What `/lyrics` and the controller Lyrics button need from a queued track. */
export interface LyricsTrack {
  title: string;
  artist: string;
  durationSeconds: number;
}

/** A reply both entry points can hand to `editReply`. */
export interface LyricsReply {
  content?: string;
  embeds?: EmbedBuilder[];
}

const LYRICS_COLOR = 0x5865f2;
const FOOTER_TEXT = 'Lyrics from LRCLIB';
const TRUNCATION_NOTE = '\n\n*...the lyrics are truncated.*';

// Discord limits: 4096 characters per embed description, 10 embeds per message, 6000 embed
// characters in total (title, descriptions and footers), 256 characters per title.
const DESCRIPTION_LIMIT = 4096;
const MAX_EMBEDS = 10;
const TOTAL_LIMIT = 6000;
const TITLE_LIMIT = 256;

/** Placeholder artist names a player gives a track it has no metadata for. */
const UNKNOWN_ARTISTS = new Set(['unknown artist', 'unknown']);

export const MSG_NOTHING_TO_LOOK_UP = '❌ No song specified and nothing is currently playing.';
export const MSG_SERVICE_DOWN =
  '⚠️ The lyrics service (LRCLIB) is not reachable right now. Please try again in a moment.';

/** The lookup for a queued track: noise-free title, and the artist without a " - Topic" suffix. */
export function lookupFromTrack(track: LyricsTrack): LrclibTrackQuery {
  const cleaned = PrecisionTrackMatcher.cleanTitle(track.title);
  const artist = track.artist.replace(/\s*-\s*Topic\s*$/i, '').trim();
  return {
    title: cleaned || track.title.trim(),
    artist: UNKNOWN_ARTISTS.has(artist.toLowerCase()) ? '' : artist,
    durationSeconds: track.durationSeconds,
  };
}

/** Lyrics as plain text: `plainLyrics`, else `syncedLyrics` with its `[mm:ss.xx]` prefixes removed. */
export function lyricsText(result: LrclibLyrics): string {
  const plain = result.plainLyrics?.trim();
  if (plain) return normalizeNewlines(plain);
  const synced = result.syncedLyrics?.trim();
  if (!synced) return '';
  return normalizeNewlines(synced)
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)+/, ''))
    .join('\n')
    .trim();
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Cuts `text` to at most `max` characters, at a line break when one exists. */
function cutAtLine(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastBreak = head.lastIndexOf('\n');
  return (lastBreak > 0 ? head.slice(0, lastBreak) : head).trimEnd();
}

/** Splits on line breaks into pieces of at most `limit` characters; a longer line is cut. */
export function splitLines(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let current = '';
  const push = () => {
    if (current) chunks.push(current);
    current = '';
  };
  for (const rawLine of text.split('\n')) {
    let line = rawLine;
    while (line.length > limit) {
      push();
      chunks.push(line.slice(0, limit));
      line = line.slice(limit);
    }
    if (current && current.length + 1 + line.length > limit) push();
    current = current ? `${current}\n${line}` : line;
  }
  push();
  return chunks;
}

function truncateTitle(title: string): string {
  return title.length <= TITLE_LIMIT ? title : `${title.slice(0, TITLE_LIMIT - 1)}…`;
}

/**
 * Embeds for a result with lyrics: the matched track in the title of the first embed, the lyrics
 * split on line breaks, and the source in the footer of the last. Text that does not fit the
 * Discord limits is cut and a note says so.
 */
export function buildLyricsEmbeds(result: LrclibLyrics, text: string): EmbedBuilder[] {
  const title = truncateTitle(
    `🎤 ${result.trackName || 'Unknown track'}${result.artistName ? ` - ${result.artistName}` : ''}`,
  );
  const budget = TOTAL_LIMIT - title.length - FOOTER_TEXT.length - TRUNCATION_NOTE.length;

  const chunks = splitLines(text, DESCRIPTION_LIMIT);
  const kept: string[] = [];
  let remaining = budget;
  let truncated = false;
  for (const chunk of chunks) {
    if (kept.length >= MAX_EMBEDS) {
      truncated = true;
      break;
    }
    if (chunk.length <= remaining) {
      kept.push(chunk);
      remaining -= chunk.length;
      continue;
    }
    const cut = cutAtLine(chunk, remaining);
    if (cut) kept.push(cut);
    truncated = true;
    break;
  }
  if (truncated && kept.length > 0) {
    const last = kept.length - 1;
    kept[last] =
      `${cutAtLine(kept[last]!, DESCRIPTION_LIMIT - TRUNCATION_NOTE.length)}${TRUNCATION_NOTE}`;
  }

  return kept.map((description, index) => {
    const embed = new EmbedBuilder().setColor(LYRICS_COLOR).setDescription(description);
    if (index === 0) embed.setTitle(title);
    if (index === kept.length - 1) embed.setFooter({ text: FOOTER_TEXT });
    return embed;
  });
}

/** Names go in inline code so user text cannot ping anyone or break the message formatting. */
function inlineCode(text: string): string {
  const clean = text.replace(/`/g, "'").replace(/\s+/g, ' ').trim();
  return `\`${clean.length > 100 ? `${clean.slice(0, 99)}…` : clean}\``;
}

function replyFor(result: LrclibLyrics | null, label: string): LyricsReply {
  if (!result) {
    return {
      content: `❌ No lyrics found for ${inlineCode(label)}. Try \`/lyrics song:<artist and title>\`.`,
    };
  }
  const text = lyricsText(result);
  if (!text) {
    if (result.instrumental) {
      return {
        content: `🎼 ${inlineCode(result.trackName || label)} is an instrumental, so it has no lyrics.`,
      };
    }
    return { content: `❌ No lyrics found for ${inlineCode(label)}.` };
  }
  return { embeds: buildLyricsEmbeds(result, text) };
}

/**
 * Looks lyrics up and turns the outcome into a reply: the lyrics, or a clear message for "no
 * lyrics", "instrumental" and "LRCLIB unreachable". Never throws, so callers cannot leak a
 * rejection; failures are logged.
 */
export async function fetchLyricsReply(
  services: Pick<BotServices, 'lrclibClient'>,
  request: { track: LyricsTrack } | { text: string },
): Promise<LyricsReply> {
  const isTrack = 'track' in request;
  const label = isTrack ? request.track.title : request.text;
  try {
    const result = isTrack
      ? await services.lrclibClient.findForTrack(lookupFromTrack(request.track))
      : await services.lrclibClient.search(request.text);
    return replyFor(result, label);
  } catch (error) {
    console.error(`[Lyrics] Lookup failed for "${label}":`, error);
    return { content: MSG_SERVICE_DOWN };
  }
}
