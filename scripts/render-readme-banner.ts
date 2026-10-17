/**
 * Renders the layered README banner (assets/readme/feature-banner.svg) to its published files.
 *
 *   pnpm readme:banner                       (writes assets/readme/)
 *   tsx scripts/render-readme-banner.ts [--svg <file>] [--out <dir>]
 *
 *   feature-banner.png   the whole SVG at its own size (1280 wide)
 *   social-card.png      1200x630 crop of the hero (x 40 to 1240), for link previews
 *   feature-banner.ora   OpenRaster: one PNG per leaf SVG layer plus stack.xml; GIMP opens it with layers
 *
 * The SVG is the master: edit it in Inkscape, then run this script again. A layer is a `g` with
 * `inkscape:groupmode="layer"`; only layers that hold no sublayer ("leaf" layers) become ORA layers.
 * Text is drawn with the Karla fonts in assets/readme/fonts (SIL Open Font License). Output is
 * deterministic: the same SVG always produces the same bytes.
 *
 * Skia's SVG engine does not draw `<image>`, so this script draws embedded pictures itself, in their
 * layer, with their transforms and `preserveAspectRatio`. Clip paths and masks are not applied to them.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import {
  createCanvas,
  GlobalFonts,
  loadImage,
  type Image,
  type SKRSContext2D,
} from '@napi-rs/canvas';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Karla files registered under one family, so `font-weight` picks the right one in the SVG. */
export const FONT_FILES = ['Karla-Regular.ttf', 'Karla-Bold.ttf', 'Karla-ExtraBold.ttf'] as const;
export const SOCIAL_CARD = { x: 40, y: 0, width: 1200, height: 630 } as const;

export interface SvgLayer {
  id: string;
  label: string;
  /** The layer has no sublayer, so it becomes one ORA layer. */
  leaf: boolean;
  hidden: boolean;
  /** Offsets of the layer's content (between its opening and closing tag). */
  contentStart: number;
  contentEnd: number;
  /** Offsets of the opening tag. */
  tagStart: number;
  tagEnd: number;
}

interface OpenElement {
  name: string;
  tagStart: number;
  tagEnd: number;
  layer: SvgLayer | null;
  hasSubLayer: boolean;
}

const TAG =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;

function attr(tag: string, name: string): string | undefined {
  const found = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return found ? (found[1] ?? found[2]) : undefined;
}

const XML_ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };

function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (whole, name: string) => {
    if (!name.startsWith('#')) return XML_ENTITIES[name] ?? whole;
    const hex = name[1] === 'x' || name[1] === 'X';
    return String.fromCodePoint(Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10));
  });
}

/** Finds every Inkscape layer (a `g` with `inkscape:groupmode="layer"`), in document order. */
export function parseLayers(svg: string): SvgLayer[] {
  const layers: SvgLayer[] = [];
  const stack: OpenElement[] = [];
  for (const match of svg.matchAll(TAG)) {
    const [whole, closing, name, attrs, selfClosing] = match;
    if (name === undefined) continue; // comment or declaration
    const tagStart = match.index;
    const tagEnd = tagStart + whole.length;
    if (closing) {
      const open = stack.pop();
      if (open?.layer) {
        open.layer.contentEnd = tagStart;
        open.layer.leaf = !open.hasSubLayer;
      }
      continue;
    }
    if (selfClosing) continue;
    let layer: SvgLayer | null = null;
    if (name === 'g' && attr(attrs ?? '', 'inkscape:groupmode') === 'layer') {
      const id = attr(attrs ?? '', 'id') ?? `layer-${layers.length + 1}`;
      layer = {
        id,
        label: unescapeXml(attr(attrs ?? '', 'inkscape:label') ?? id),
        leaf: true,
        hidden: /display\s*:\s*none/.test(attr(attrs ?? '', 'style') ?? ''),
        contentStart: tagEnd,
        contentEnd: tagEnd,
        tagStart,
        tagEnd,
      };
      layers.push(layer);
      const parentLayer = [...stack].reverse().find((entry) => entry.layer !== null);
      if (parentLayer) parentLayer.hasSubLayer = true;
    }
    stack.push({ name, tagStart, tagEnd, layer, hasSubLayer: false });
  }
  return layers;
}

/**
 * Returns the SVG with the content of every other leaf layer removed, so only `keep` is drawn.
 * A hidden `keep` layer is made visible for the render (the ORA records it as hidden).
 * With `keep` null, only what sits outside every leaf layer is left.
 */
export function isolateLayer(svg: string, layers: SvgLayer[], keep: SvgLayer | null): string {
  const leaves = layers.filter((layer) => layer.leaf);
  let result = svg;
  for (const layer of [...leaves].sort((a, b) => b.contentStart - a.contentStart)) {
    if (layer === keep) {
      if (layer.hidden) {
        const tag = result.slice(layer.tagStart, layer.tagEnd);
        result =
          result.slice(0, layer.tagStart) +
          tag.replace(/display\s*:\s*none\s*;?/g, '') +
          result.slice(layer.tagEnd);
      }
      continue;
    }
    result = result.slice(0, layer.contentStart) + result.slice(layer.contentEnd);
  }
  return result;
}

// --- embedded pictures (`<image>`), which Skia's SVG engine skips ---

/** A 2D affine matrix [a, b, c, d, e, f], as in SVG `matrix()` and canvas `setTransform`. */
export type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const [A, B, C, D, E, F] = n;
  return [
    a * A + c * B,
    b * A + d * B,
    a * C + c * D,
    b * C + d * D,
    a * E + c * F + e,
    b * E + d * F + f,
  ];
}

/** Parses an SVG `transform` list (matrix, translate, scale, rotate, skewX, skewY). */
export function parseTransform(value: string | undefined): Matrix {
  let result = IDENTITY;
  for (const [, name, args] of (value ?? '').matchAll(
    /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g,
  )) {
    const n = (args ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    const radians = ((n[0] ?? 0) * Math.PI) / 180;
    let step: Matrix;
    switch (name) {
      case 'matrix':
        step = [n[0] ?? 1, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1, n[4] ?? 0, n[5] ?? 0];
        break;
      case 'translate':
        step = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
        break;
      case 'scale':
        step = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
        const turn: Matrix = [
          Math.cos(radians),
          Math.sin(radians),
          -Math.sin(radians),
          Math.cos(radians),
          0,
          0,
        ];
        step = multiply(multiply([1, 0, 0, 1, cx, cy], turn), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        step = [1, 0, Math.tan(radians), 1, 0, 0];
        break;
      default:
        step = [1, Math.tan(radians), 0, 1, 0, 0];
    }
    result = multiply(result, step);
  }
  return result;
}

export interface SvgImage {
  /** Offset of the `<image>` tag, used to find the layer that holds it. */
  offset: number;
  href: string;
  x: number;
  y: number;
  /** Missing width or height means the picture's own size. */
  width: number | undefined;
  height: number | undefined;
  preserveAspectRatio: string;
  /** Every transform from the root down to the image, combined. */
  matrix: Matrix;
  /** Opening-tag offsets of the elements (the image included) that hide it with display none. */
  hiddenBy: number[];
}

/** Elements whose children are only referenced, never drawn where they stand. */
const NOT_DRAWN = new Set(['defs', 'clipPath', 'mask', 'pattern', 'symbol', 'marker']);

function hides(attrs: string): boolean {
  return /display\s*:\s*none/.test(attr(attrs, 'style') ?? '') || attr(attrs, 'display') === 'none';
}

function length(value: string | undefined): number | undefined {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Finds every drawable `<image>`, in document order. */
export function parseImages(svg: string): SvgImage[] {
  const images: SvgImage[] = [];
  const stack: { matrix: Matrix; hiddenBy: number[]; notDrawn: boolean }[] = [];
  for (const match of svg.matchAll(TAG)) {
    const [, closing, name, attrs = '', selfClosing] = match;
    if (name === undefined) continue;
    if (closing) {
      stack.pop();
      continue;
    }
    const parent = stack.at(-1);
    let own = parseTransform(attr(attrs, 'transform'));
    const viewBox = attr(attrs, 'viewBox')
      ?.split(/[\s,]+/)
      .map(Number);
    if (name === 'svg' && !parent && viewBox?.length === 4) {
      const [vx = 0, vy = 0, vw = 1, vh = 1] = viewBox;
      const sx = (length(attr(attrs, 'width')) ?? vw) / vw;
      const sy = (length(attr(attrs, 'height')) ?? vh) / vh;
      own = [sx, 0, 0, sy, -vx * sx, -vy * sy];
    }
    const matrix = multiply(parent?.matrix ?? IDENTITY, own);
    const hiddenBy = hides(attrs)
      ? [...(parent?.hiddenBy ?? []), match.index]
      : (parent?.hiddenBy ?? []);
    const notDrawn = (parent?.notDrawn ?? false) || NOT_DRAWN.has(name);
    if (name === 'image' && !notDrawn) {
      images.push({
        offset: match.index,
        href: unescapeXml(attr(attrs, 'href') ?? attr(attrs, 'xlink:href') ?? ''),
        x: length(attr(attrs, 'x')) ?? 0,
        y: length(attr(attrs, 'y')) ?? 0,
        width: length(attr(attrs, 'width')),
        height: length(attr(attrs, 'height')),
        preserveAspectRatio: attr(attrs, 'preserveAspectRatio') ?? 'xMidYMid meet',
        matrix,
        hiddenBy,
      });
    }
    if (!selfClosing) stack.push({ matrix, hiddenBy, notDrawn });
  }
  return images;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a picture of `width` x `height` lands in `box`, following `preserveAspectRatio`. */
export function placeImage(
  box: Box,
  width: number,
  height: number,
  preserveAspectRatio: string,
): Box {
  const [align = 'xMidYMid', mode = 'meet'] = preserveAspectRatio.trim().split(/\s+/);
  if (align === 'none') return box;
  const scale = (mode === 'slice' ? Math.max : Math.min)(box.width / width, box.height / height);
  const fx = align.startsWith('xMin') ? 0 : align.startsWith('xMax') ? 1 : 0.5;
  const fy = align.endsWith('YMin') ? 0 : align.endsWith('YMax') ? 1 : 0.5;
  return {
    x: box.x + (box.width - width * scale) * fx,
    y: box.y + (box.height - height * scale) * fy,
    width: width * scale,
    height: height * scale,
  };
}

async function decodeImage(href: string): Promise<Image> {
  const data = /^data:[^,]*?(;base64)?,([\s\S]*)$/.exec(href);
  if (!data) {
    throw new Error(
      `The banner links a picture (${href.slice(0, 80)}). Embed it instead (Embed in the Inkscape import dialog).`,
    );
  }
  const payload = data[2] ?? '';
  return loadImage(
    data[1]
      ? Buffer.from(payload.replace(/\s/g, ''), 'base64')
      : Buffer.from(decodeURIComponent(payload)),
  );
}

/** Draws `images` onto `ctx`, each clipped to its own box. `pictures` caches decoded pictures by href. */
async function drawImages(
  ctx: SKRSContext2D,
  images: SvgImage[],
  pictures: Map<string, Promise<Image>>,
): Promise<void> {
  for (const image of images) {
    let picture = pictures.get(image.href);
    if (!picture) {
      picture = decodeImage(image.href);
      pictures.set(image.href, picture);
    }
    const loaded = await picture;
    const box = {
      x: image.x,
      y: image.y,
      width: image.width ?? loaded.width,
      height: image.height ?? loaded.height,
    };
    const at = placeImage(box, loaded.width, loaded.height, image.preserveAspectRatio);
    ctx.save();
    ctx.setTransform(...image.matrix);
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.width, box.height);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(loaded, at.x, at.y, at.width, at.height);
    ctx.restore();
  }
}

// --- minimal zip writer (OpenRaster is a zip whose first entry is an uncompressed `mimetype`) ---

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Buffer;
  /** Store without compression (used for `mimetype` and for PNG data, which is already packed). */
  store?: boolean;
}

/** Writes a zip with a fixed timestamp, so the same entries always give the same bytes. */
export function zip(entries: ZipEntry[]): Buffer {
  const DOS_TIME = 0;
  const DOS_DATE = (1 << 5) | 1; // 1980-01-01
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const stored = entry.store === true;
    const body = stored ? entry.data : deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(stored ? 0 : 8, 10);
    dir.writeUInt16LE(DOS_TIME, 12);
    dir.writeUInt16LE(DOS_DATE, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(entry.data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += local.length + name.length + body.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

// --- rendering ---

interface Rendered {
  width: number;
  height: number;
  png: Buffer;
}

function drawSvg(image: Image, width: number, height: number) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, width, height);
  return { canvas, ctx };
}

/** The smallest rectangle that holds every pixel that is not fully transparent, or null. */
export function opaqueBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((rgba[(y * width + x) * 4 + 3] ?? 0) === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function xmlAttr(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export interface BannerOutput {
  banner: Buffer;
  social: Buffer;
  ora: Buffer;
  width: number;
  height: number;
  layerCount: number;
  emptyLayers: string[];
}

/** Renders the SVG text into the banner PNG, the social card and the OpenRaster file. */
export async function renderBanner(svg: string): Promise<BannerOutput> {
  const layers = parseLayers(svg);
  const leaves = layers.filter((layer) => layer.leaf);
  const images = parseImages(svg);
  const pictures = new Map<string, Promise<Image>>();
  const inLayer = (image: SvgImage, layer: SvgLayer) =>
    image.offset >= layer.contentStart && image.offset < layer.contentEnd;

  // The banner is built layer by layer, so pictures stack in their layer's place. Content outside
  // every leaf layer (normally none) goes underneath.
  const outside = await loadImage(Buffer.from(isolateLayer(svg, layers, null)));
  const { width, height } = outside;
  const full = drawSvg(outside, width, height);
  await drawImages(
    full.ctx,
    images.filter(
      (image) => image.hiddenBy.length === 0 && !leaves.some((leaf) => inLayer(image, leaf)),
    ),
    pictures,
  );

  const rendered: { layer: SvgLayer; x: number; y: number; image: Rendered }[] = [];
  const emptyLayers: string[] = [];
  for (const layer of leaves) {
    const only = await loadImage(Buffer.from(isolateLayer(svg, layers, layer)));
    const { canvas, ctx } = drawSvg(only, width, height);
    // isolateLayer shows a hidden layer, so only that layer may be among a picture's hiders.
    await drawImages(
      ctx,
      images.filter(
        (image) => inLayer(image, layer) && image.hiddenBy.every((at) => at === layer.tagStart),
      ),
      pictures,
    );
    if (!layer.hidden) full.ctx.drawImage(canvas, 0, 0);
    const bounds = opaqueBounds(ctx.getImageData(0, 0, width, height).data, width, height);
    if (!bounds) {
      emptyLayers.push(layer.label);
      continue;
    }
    const crop = createCanvas(bounds.width, bounds.height);
    crop
      .getContext('2d')
      .drawImage(
        canvas,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        0,
        0,
        bounds.width,
        bounds.height,
      );
    rendered.push({
      layer,
      x: bounds.x,
      y: bounds.y,
      image: { width: bounds.width, height: bounds.height, png: crop.toBuffer('image/png') },
    });
  }
  const banner = full.canvas.toBuffer('image/png');

  const social = createCanvas(SOCIAL_CARD.width, SOCIAL_CARD.height);
  social
    .getContext('2d')
    .drawImage(
      full.canvas,
      SOCIAL_CARD.x,
      SOCIAL_CARD.y,
      SOCIAL_CARD.width,
      SOCIAL_CARD.height,
      0,
      0,
      SOCIAL_CARD.width,
      SOCIAL_CARD.height,
    );

  // OpenRaster lists the top layer first; SVG document order has the top layer last.
  const topFirst = [...rendered].reverse();
  const stackXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<image version="0.0.3" w="${width}" h="${height}">`,
    '  <stack>',
    ...topFirst.map(
      ({ layer, x, y }) =>
        `    <layer name="${xmlAttr(layer.label)}" src="data/${layer.id}.png" x="${x}" y="${y}" opacity="1.0" visibility="${layer.hidden ? 'hidden' : 'visible'}" composite-op="svg:src-over"/>`,
    ),
    '  </stack>',
    '</image>',
    '',
  ].join('\n');

  const thumbScale = 256 / Math.max(width, height);
  const thumb = createCanvas(Math.round(width * thumbScale), Math.round(height * thumbScale));
  thumb.getContext('2d').drawImage(full.canvas, 0, 0, thumb.width, thumb.height);

  const ora = zip([
    { name: 'mimetype', data: Buffer.from('image/openraster', 'ascii'), store: true },
    { name: 'stack.xml', data: Buffer.from(stackXml, 'utf8') },
    ...topFirst.map(({ layer, image }) => ({
      name: `data/${layer.id}.png`,
      data: image.png,
      store: true,
    })),
    { name: 'mergedimage.png', data: banner, store: true },
    { name: 'Thumbnails/thumbnail.png', data: thumb.toBuffer('image/png'), store: true },
  ]);

  return {
    banner,
    social: social.toBuffer('image/png'),
    ora,
    width,
    height,
    layerCount: rendered.length,
    emptyLayers,
  };
}

export function registerFonts(fontsDir: string): void {
  for (const file of FONT_FILES) {
    if (!GlobalFonts.registerFromPath(resolve(fontsDir, file), 'Karla')) {
      throw new Error(`Could not register the font ${file} from ${fontsDir}`);
    }
  }
}

function readArg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

async function main(): Promise<void> {
  const outDir = resolve(readArg('out') ?? resolve(ROOT, 'assets/readme'));
  const svgPath = resolve(readArg('svg') ?? resolve(outDir, 'feature-banner.svg'));
  registerFonts(resolve(ROOT, 'assets/readme/fonts'));
  const result = await renderBanner(readFileSync(svgPath, 'utf8'));
  mkdirSync(outDir, { recursive: true });
  const files: [string, Buffer][] = [
    ['feature-banner.png', result.banner],
    ['social-card.png', result.social],
    ['feature-banner.ora', result.ora],
  ];
  for (const [name, data] of files) {
    writeFileSync(resolve(outDir, name), data);
    console.log(`wrote ${resolve(outDir, name)}`);
  }
  console.log(`${result.width}x${result.height}, ${result.layerCount} layers in the .ora`);
  for (const label of result.emptyLayers) console.warn(`skipped empty layer: ${label}`);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  await main();
}
