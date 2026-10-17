import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, isolateLayer, opaqueBounds, parseLayers, zip } from './render-readme-banner';

const SVG = `<?xml version="1.0"?>
<!-- a comment with <g inkscape:groupmode="layer"> inside -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="10" height="10">
  <g id="outer" inkscape:groupmode="layer" inkscape:label="Outer &amp; more">
    <g id="a" inkscape:groupmode="layer" inkscape:label="A"><rect id="ra" width="1" height="1"/></g>
    <g id="b" inkscape:groupmode="layer" inkscape:label="B" style="display:none"><text>x</text></g>
  </g>
  <g id="plain"><rect id="rp" width="1" height="1"/></g>
</svg>`;

describe('parseLayers', () => {
  it('finds layers, marks leaves, reads labels and ignores comments', () => {
    const layers = parseLayers(SVG);
    expect(layers.map((l) => [l.id, l.label, l.leaf, l.hidden])).toEqual([
      ['outer', 'Outer & more', false, false],
      ['a', 'A', true, false],
      ['b', 'B', true, true],
    ]);
  });

  it('parses the real banner: every section is a layer with sublayers', () => {
    const svg = readFileSync(resolve(__dirname, '../assets/readme/feature-banner.svg'), 'utf8');
    const layers = parseLayers(svg);
    const sections = layers.filter((l) => !l.leaf);
    expect(sections.map((l) => l.label)).toEqual([
      '01 Hero',
      '02 Music',
      '03 Waifu TCG and adventure',
      '04 AI chat',
      '05 Moderation and economy',
      '06 Web dashboard',
      '07 Self-hosting',
      '08 Community',
    ]);
    for (const section of sections.slice(1)) {
      const labels = layers
        .filter((l) => l.leaf && l.id.startsWith(section.id.replace('layer-', '') + '-'))
        .map((l) => l.label.split(': ')[1]);
      expect(labels).toEqual([
        'Base colour',
        'Background art',
        'Scrim',
        'Screenshot frame',
        'Heading',
        'Body text',
      ]);
    }
  });
});

describe('isolateLayer', () => {
  it('keeps only the chosen leaf layer content and shows a hidden one', () => {
    const layers = parseLayers(SVG);
    const [, a, b] = layers;
    const onlyA = isolateLayer(SVG, layers, a!);
    expect(onlyA).toContain('id="ra"');
    expect(onlyA).not.toContain('<text>');
    expect(onlyA).toContain('id="rp"'); // content outside layers stays
    const onlyB = isolateLayer(SVG, layers, b!);
    expect(onlyB).toContain('<text>');
    expect(onlyB).not.toContain('id="ra"');
    expect(onlyB).not.toContain('display:none');
  });
});

describe('opaqueBounds', () => {
  it('returns the box of non-transparent pixels, or null when empty', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    expect(opaqueBounds(rgba, 4, 4)).toBeNull();
    rgba[(1 * 4 + 2) * 4 + 3] = 255;
    rgba[(2 * 4 + 1) * 4 + 3] = 9;
    expect(opaqueBounds(rgba, 4, 4)).toEqual({ x: 1, y: 1, width: 2, height: 2 });
  });
});

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('writes a stored first entry and readable deflated entries, deterministically', () => {
    const entries = [
      { name: 'mimetype', data: Buffer.from('image/openraster'), store: true },
      { name: 'a.txt', data: Buffer.from('hello hello hello hello') },
    ];
    const first = zip(entries);
    expect(zip(entries).equals(first)).toBe(true);
    expect(first.readUInt32LE(0)).toBe(0x04034b50);
    expect(first.subarray(30, 38).toString()).toBe('mimetype');
    expect(first.subarray(38, 54).toString()).toBe('image/openraster');
    const second = 54;
    const size = first.readUInt32LE(second + 18);
    const nameLength = first.readUInt16LE(second + 26);
    const body = first.subarray(second + 30 + nameLength, second + 30 + nameLength + size);
    expect(inflateRawSync(body).toString()).toBe('hello hello hello hello');
    expect(first.readUInt32LE(first.length - 22)).toBe(0x06054b50);
  });
});
