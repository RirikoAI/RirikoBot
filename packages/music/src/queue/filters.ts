import type { AudioFilterName } from './types.js';

export const AUDIO_FILTERS: Record<AudioFilterName, string> = {
  normal: '',
  bassboost: 'bass=g=10,dynaudnorm=f=200',
  bassboost_high: 'bass=g=20,dynaudnorm=f=200',
  nightcore: 'asetrate=48000*1.25,aresample=48000,atempo=1.06',
  vaporwave: 'asetrate=48000*0.8,aresample=48000,atempo=1.0',
  '8d': 'apulsator=hz=0.08',
  treble: 'treble=g=5',
  pop: 'equalizer=f=1000:t=q:w=1:g=2',
  soft: 'lowpass=f=1000',
  karaoke: 'stereotools=mlev=0.01',
};

export const FILTER_DESCRIPTIONS: Record<AudioFilterName, string> = {
  normal: 'Flat response with no audio modification',
  bassboost: 'Medium bass boost (+10dB with dynamic audio normalization)',
  bassboost_high: 'Extreme bass boost (+20dB with dynamic audio normalization)',
  nightcore: 'Pitched up and sped up (+25% pitch, 1.06x tempo)',
  vaporwave: 'Slowed down and deep pitched (0.8x speed, 1.0x tempo)',
  '8d': 'Binaural rotational panning sound simulation',
  treble: 'Crisp treble boost (+5dB)',
  pop: 'Mid-range boost for pop vocals',
  soft: 'Low-pass filter for soft and relaxed listening',
  karaoke: 'Attenuated center vocal channel for karaoke sing-along',
};

/**
 * Validates whether a given string is a valid audio filter name.
 */
export function isValidFilter(name: string): name is AudioFilterName {
  return Object.prototype.hasOwnProperty.call(AUDIO_FILTERS, name);
}

/**
 * Compiles a set or array of active audio filters into an FFmpeg audio filter argument array.
 * e.g. `['-af', 'bass=g=10,dynaudnorm=f=200,apulsator=hz=0.08']`
 */
export function buildFilterArgs(activeFilters: Iterable<AudioFilterName>): string[] {
  const filterStrings: string[] = [];
  for (const filter of activeFilters) {
    if (filter === 'normal') continue;
    const filterStr = AUDIO_FILTERS[filter];
    if (filterStr) {
      filterStrings.push(filterStr);
    }
  }

  if (filterStrings.length === 0) {
    return [];
  }

  return ['-af', filterStrings.join(',')];
}

/**
 * Clamps volume to a safe range of 0% to 150% to prevent hearing damage and audio clipping.
 * Default is 80%.
 */
export function clampVolume(volume: number, fallback = 80): number {
  if (typeof volume !== 'number' || Number.isNaN(volume)) {
    return fallback;
  }
  return Math.max(0, Math.min(150, Math.round(volume)));
}

/**
 * Converts a percentage volume (0 - 150) to a linear gain multiplier for Discord AudioResource.
 * 100% -> 1.0, 150% -> 1.5, 0% -> 0.0
 */
export function volumeToGain(volume: number): number {
  const clamped = clampVolume(volume);
  return clamped / 100;
}
