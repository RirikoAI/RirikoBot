import type { CardElement } from '../types.js';

export interface SeedWaifuDefinition {
  sourceImageId: string;
  characterName: string;
  animeTitle: string;
  element: CardElement;
  tags: string[];
  width: number;
  height: number;
}

/**
 * Creates a valid, minimal PNG binary buffer with custom dimensions in the IHDR chunk.
 */
export function createMockPngBuffer(width = 600, height = 900, seed = ''): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk: length (4 bytes) + chunk type 'IHDR' (4 bytes) + data (13 bytes) + CRC (4 bytes)
  const ihdrChunk = Buffer.alloc(4 + 4 + 13 + 4);
  ihdrChunk.writeUInt32BE(13, 0);
  ihdrChunk.write('IHDR', 4, 'ascii');
  ihdrChunk.writeUInt32BE(width, 8);
  ihdrChunk.writeUInt32BE(height, 12);
  ihdrChunk.writeUInt8(8, 16); // 8-bit depth
  ihdrChunk.writeUInt8(2, 17); // Truecolor RGB
  ihdrChunk.writeUInt8(0, 18); // Compression
  ihdrChunk.writeUInt8(0, 19); // Filter
  ihdrChunk.writeUInt8(0, 20); // Interlace
  ihdrChunk.writeUInt32BE(0x12345678, 21); // Mock CRC

  // Optional tEXt chunk for unique hash identification
  let textChunk = Buffer.alloc(0);
  if (seed) {
    const textData = Buffer.from(`Seed\0${seed}`, 'utf-8');
    textChunk = Buffer.alloc(4 + 4 + textData.length + 4);
    textChunk.writeUInt32BE(textData.length, 0);
    textChunk.write('tEXt', 4, 'ascii');
    textData.copy(textChunk, 8);
    textChunk.writeUInt32BE(0x87654321, 8 + textData.length);
  }

  // IEND chunk
  const iendChunk = Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  return Buffer.concat([header, ihdrChunk, textChunk, iendChunk]);
}

export const CANONICAL_SEED_ASSETS: SeedWaifuDefinition[] = [
  // FIRE
  {
    sourceImageId: 'seed_fire_01',
    characterName: 'Rias Gremory',
    animeTitle: 'High School DxD',
    element: 'FIRE',
    tags: ['rias_gremory', 'crimson_hair', 'fire'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_fire_02',
    characterName: 'Megumin',
    animeTitle: 'KonoSuba',
    element: 'FIRE',
    tags: ['megumin', 'explosion', 'fire'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_fire_03',
    characterName: 'Rin Tohsaka',
    animeTitle: 'Fate/stay night',
    element: 'FIRE',
    tags: ['rin_tohsaka', 'twintails', 'fire'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_fire_04',
    characterName: 'Nezuko Kamado',
    animeTitle: 'Demon Slayer',
    element: 'FIRE',
    tags: ['nezuko_kamado', 'kimono', 'fire'],
    width: 600,
    height: 900,
  },

  // ICE
  {
    sourceImageId: 'seed_ice_01',
    characterName: 'Esdeath',
    animeTitle: 'Akame ga Kill!',
    element: 'ICE',
    tags: ['esdeath', 'general', 'ice', 'freeze'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_ice_02',
    characterName: 'Emilia',
    animeTitle: 'Re:Zero',
    element: 'ICE',
    tags: ['emilia', 'silver_hair', 'ice', 'spirit'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_ice_03',
    characterName: 'Yukino Yukinoshita',
    animeTitle: 'Oregairu',
    element: 'ICE',
    tags: ['yukino', 'ice_queen'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_ice_04',
    characterName: 'Cirno',
    animeTitle: 'Touhou',
    element: 'ICE',
    tags: ['cirno', 'fairy', 'ice'],
    width: 600,
    height: 900,
  },

  // EARTH
  {
    sourceImageId: 'seed_earth_01',
    characterName: 'Raphtalia',
    animeTitle: 'The Rising of the Shield Hero',
    element: 'EARTH',
    tags: ['raphtalia', 'tanuki', 'earth', 'sword'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_earth_02',
    characterName: 'Holo',
    animeTitle: 'Spice and Wolf',
    element: 'EARTH',
    tags: ['holo', 'wise_wolf', 'earth', 'wheat'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_earth_03',
    characterName: 'Diane',
    animeTitle: 'The Seven Deadly Sins',
    element: 'EARTH',
    tags: ['diane', 'giant', 'earth', 'gideon'],
    width: 600,
    height: 900,
  },

  // LIGHTNING
  {
    sourceImageId: 'seed_lightning_01',
    characterName: 'Mikoto Misaka',
    animeTitle: 'A Certain Scientific Railgun',
    element: 'LIGHTNING',
    tags: ['mikoto_misaka', 'railgun', 'lightning', 'electromaster'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_lightning_02',
    characterName: 'Raiden Shogun',
    animeTitle: 'Genshin Impact',
    element: 'LIGHTNING',
    tags: ['raiden_shogun', 'electro', 'lightning', 'katana'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_lightning_03',
    characterName: 'Sailor Jupiter',
    animeTitle: 'Sailor Moon',
    element: 'LIGHTNING',
    tags: ['makoto_kino', 'sailor_jupiter', 'thunder'],
    width: 600,
    height: 900,
  },

  // WATER
  {
    sourceImageId: 'seed_water_01',
    characterName: 'Rem',
    animeTitle: 'Re:Zero',
    element: 'WATER',
    tags: ['rem', 'maid', 'water', 'morningstar'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_water_02',
    characterName: 'Aqua',
    animeTitle: 'KonoSuba',
    element: 'WATER',
    tags: ['aqua', 'goddess', 'water', 'purification'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_water_03',
    characterName: 'Juvia Lockser',
    animeTitle: 'Fairy Tail',
    element: 'WATER',
    tags: ['juvia', 'water_mage', 'water'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_water_04',
    characterName: 'Chika Fujiwara',
    animeTitle: 'Kaguya-sama: Love Is War',
    element: 'WATER',
    tags: ['chika_fujiwara', 'pink_hair', 'water'],
    width: 600,
    height: 900,
  },

  // LIGHT
  {
    sourceImageId: 'seed_light_01',
    characterName: 'Saber',
    animeTitle: 'Fate/stay night',
    element: 'LIGHT',
    tags: ['artoria_pendragon', 'saber', 'excalibur', 'light'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_light_02',
    characterName: 'Madoka Kaname',
    animeTitle: 'Puella Magi Madoka Magica',
    element: 'LIGHT',
    tags: ['madoka_kaname', 'goddess', 'light'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_light_03',
    characterName: 'Violet Evergarden',
    animeTitle: 'Violet Evergarden',
    element: 'LIGHT',
    tags: ['violet_evergarden', 'doll', 'light'],
    width: 600,
    height: 900,
  },

  // SHADOW
  {
    sourceImageId: 'seed_shadow_01',
    characterName: 'Makima',
    animeTitle: 'Chainsaw Man',
    element: 'SHADOW',
    tags: ['makima', 'control_devil', 'shadow', 'suit'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_shadow_02',
    characterName: 'Kurumi Tokisaki',
    animeTitle: 'Date A Live',
    element: 'SHADOW',
    tags: ['kurumi_tokisaki', 'nightmare', 'shadow', 'clock'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_shadow_03',
    characterName: 'Akame',
    animeTitle: 'Akame ga Kill!',
    element: 'SHADOW',
    tags: ['akame', 'murasame', 'shadow', 'assassin'],
    width: 600,
    height: 900,
  },
  {
    sourceImageId: 'seed_shadow_04',
    characterName: 'Albedo',
    animeTitle: 'Overlord',
    element: 'SHADOW',
    tags: ['albedo', 'succubus', 'shadow', 'horns'],
    width: 600,
    height: 900,
  },
];
