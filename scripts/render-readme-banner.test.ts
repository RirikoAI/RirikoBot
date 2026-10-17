import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import {
  crc32,
  isolateLayer,
  opaqueBounds,
  parseImages,
  parseLayers,
  parseTransform,
  placeImage,
  renderBanner,
  zip,
} from './render-readme-banner';

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

describe('parseTransform', () => {
  it('combines a transform list left to right', () => {
    expect(parseTransform(undefined)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseTransform('translate(10, 5) scale(2)')).toEqual([2, 0, 0, 2, 10, 5]);
    expect(parseTransform('matrix(1,0,0,1,3,4) translate(1)')).toEqual([1, 0, 0, 1, 4, 4]);
    const turned = parseTransform('rotate(90 1 1)');
    expect(turned.map((n) => Math.round(n * 1e9) / 1e9 + 0)).toEqual([0, 1, -1, 0, 2, 0]);
    expect(parseTransform('skewX(45)')[2]).toBeCloseTo(1);
    expect(parseTransform('skewY(45)')[1]).toBeCloseTo(1);
  });
});

describe('parseImages', () => {
  it('reads drawable images with their combined transform and hiders', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 10 10">
      <defs><image href="data:,skip" width="1" height="1"/></defs>
      <g transform="translate(1,2)" style="display:none">
        <image id="i" xlink:href="data:image/png;base64,AA&#10;BB" x="3" y="4" width="5" preserveAspectRatio="none"/>
      </g>
    </svg>`;
    const images = parseImages(svg);
    expect(images).toHaveLength(1);
    const [image] = images;
    expect(image).toMatchObject({
      href: 'data:image/png;base64,AA\nBB',
      x: 3,
      y: 4,
      width: 5,
      height: undefined,
      preserveAspectRatio: 'none',
      matrix: [2, 0, 0, 2, 2, 4],
    });
    expect(image!.hiddenBy).toEqual([svg.indexOf('<g transform')]);
  });
});

describe('placeImage', () => {
  const box = { x: 0, y: 0, width: 100, height: 50 };
  it('follows preserveAspectRatio', () => {
    expect(placeImage(box, 10, 10, 'none')).toEqual(box);
    expect(placeImage(box, 10, 10, 'xMidYMid meet')).toEqual({
      x: 25,
      y: 0,
      width: 50,
      height: 50,
    });
    expect(placeImage(box, 10, 10, 'xMinYMax slice')).toEqual({
      x: 0,
      y: -50,
      width: 100,
      height: 100,
    });
    expect(placeImage(box, 10, 10, 'xMaxYMin')).toEqual({ x: 50, y: 0, width: 50, height: 50 });
  });
});

describe('renderBanner', () => {
  it('draws embedded pictures in their layer, under the layers above', async () => {
    const red = createCanvas(2, 2);
    const ctx = red.getContext('2d');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 2, 2);
    const href = `data:image/png;base64,${red.toBuffer('image/png').toString('base64')}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="10" height="10">
      <g id="pic" inkscape:groupmode="layer" inkscape:label="Picture"><g transform="translate(2,0)">
        <image xlink:href="${href}" x="2" y="2" width="4" height="4" preserveAspectRatio="none"/></g></g>
      <g id="cover" inkscape:groupmode="layer" inkscape:label="Cover"><rect width="10" height="3" fill="#0000ff"/></g>
      <g id="off" inkscape:groupmode="layer" inkscape:label="Off" style="display:none">
        <image xlink:href="${href}" x="0" y="8" width="2" height="2"/></g>
    </svg>`;
    const result = await renderBanner(svg);
    const banner = await loadImage(result.banner);
    const check = createCanvas(10, 10).getContext('2d');
    check.drawImage(banner, 0, 0);
    const pixel = (x: number, y: number) => Array.from(check.getImageData(x, y, 1, 1).data);
    expect(pixel(5, 4)).toEqual([255, 0, 0, 255]);
    expect(pixel(5, 1)).toEqual([0, 0, 255, 255]);
    expect(pixel(1, 5)[3]).toBe(0);
    expect(pixel(1, 9)[3]).toBe(0); // a hidden layer stays out of the banner
    expect(result.layerCount).toBe(3); // but is still an ORA layer
    expect(result.emptyLayers).toEqual([]);
  });

  it('refuses a linked picture', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><image href="art.png" width="4" height="4"/></svg>`;
    await expect(renderBanner(svg)).rejects.toThrow('Embed it instead');
  });
});
