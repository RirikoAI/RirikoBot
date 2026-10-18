import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';

const ASSETS_DIR = path.resolve(process.cwd(), 'assets/tcg');
const ELEMENTS_DIR = path.join(ASSETS_DIR, 'elements');
const STARS_DIR = path.join(ASSETS_DIR, 'stars');
const FOILS_DIR = path.join(ASSETS_DIR, 'foils');
const FRAMES_DIR = path.join(ASSETS_DIR, 'frames');

function ensureDirectories(): void {
  for (const dir of [ASSETS_DIR, ELEMENTS_DIR, STARS_DIR, FOILS_DIR, FRAMES_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// ─── 1. ELEMENT ICONS (128x128 px) ──────────────────────────────────────────

function drawCircleBase(
  ctx: SKRSContext2D,
  size: number,
  c1: string,
  c2: string,
  border: string,
): void {
  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;

  // Background radial
  const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Outer ring
  ctx.lineWidth = 3;
  ctx.strokeStyle = border;
  ctx.stroke();

  // Subtle inner highlight ring
  ctx.beginPath();
  ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.stroke();
}

function generateFireElement(): Buffer {
  const canvas = createCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  drawCircleBase(ctx, 128, '#ff7849', '#991b1b', '#f97316');

  // Draw stylized flame
  ctx.save();
  ctx.translate(64, 66);
  ctx.beginPath();
  ctx.moveTo(0, 32);
  ctx.bezierCurveTo(-24, 32, -32, 10, -20, -10);
  ctx.bezierCurveTo(-25, -2, -15, 6, -10, 0);
  ctx.bezierCurveTo(-15, -18, -4, -34, 0, -42);
  ctx.bezierCurveTo(8, -26, 18, -14, 12, 0);
  ctx.bezierCurveTo(20, -8, 28, 6, 20, 20);
  ctx.bezierCurveTo(28, 14, 28, 32, 0, 32);
  ctx.closePath();

  const flameGrad = ctx.createLinearGradient(0, 32, 0, -42);
  flameGrad.addColorStop(0, '#ea580c');
  flameGrad.addColorStop(0.5, '#facc15');
  flameGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = flameGrad;
  ctx.shadowColor = '#f97316';
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.restore();

  return canvas.toBuffer('image/png');
}

function generateIceElement(): Buffer {
  const canvas = createCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  drawCircleBase(ctx, 128, '#38bdf8', '#0369a1', '#7dd3fc');

  // Draw crystalline snowflake
  ctx.save();
  ctx.translate(64, 64);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#0284c7';
  ctx.shadowBlur = 10;

  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -34);
    // V-branches
    ctx.moveTo(0, -18);
    ctx.lineTo(-10, -26);
    ctx.moveTo(0, -18);
    ctx.lineTo(10, -26);
    ctx.stroke();

    // End diamond
    ctx.beginPath();
    ctx.arc(0, -34, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // Center crystal
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#e0f2fe';
  ctx.fill();
  ctx.restore();

  return canvas.toBuffer('image/png');
}

function generateWaterElement(): Buffer {
  const canvas = createCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  drawCircleBase(ctx, 128, '#60a5fa', '#1e3a8a', '#3b82f6');

  // Draw water droplet & crest
  ctx.save();
  ctx.translate(64, 64);
  ctx.beginPath();
  ctx.moveTo(0, -36);
  ctx.bezierCurveTo(18, -14, 28, 4, 28, 18);
  ctx.bezierCurveTo(28, 34, 15, 38, 0, 38);
  ctx.bezierCurveTo(-15, 38, -28, 34, -28, 18);
  ctx.bezierCurveTo(-28, 4, -18, -14, 0, -36);
  ctx.closePath();

  const dropGrad = ctx.createLinearGradient(0, -36, 0, 38);
  dropGrad.addColorStop(0, '#ffffff');
  dropGrad.addColorStop(0.4, '#93c5fd');
  dropGrad.addColorStop(1, '#2563eb');
  ctx.fillStyle = dropGrad;
  ctx.shadowColor = '#60a5fa';
  ctx.shadowBlur = 10;
  ctx.fill();

  // Inner ripple wave
  ctx.beginPath();
  ctx.arc(0, 16, 12, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  return canvas.toBuffer('image/png');
}

function generateEarthElement(): Buffer {
  const canvas = createCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  drawCircleBase(ctx, 128, '#4ade80', '#14532d', '#22c55e');

  // Draw crystal / stone shield
  ctx.save();
  ctx.translate(64, 64);
  ctx.beginPath();
  ctx.moveTo(0, -36);
  ctx.lineTo(26, -16);
  ctx.lineTo(22, 18);
  ctx.lineTo(0, 36);
  ctx.lineTo(-22, 18);
  ctx.lineTo(-26, -16);
  ctx.closePath();

  const earthGrad = ctx.createLinearGradient(0, -36, 0, 36);
  earthGrad.addColorStop(0, '#bbf7d0');
  earthGrad.addColorStop(0.5, '#22c55e');
  earthGrad.addColorStop(1, '#15803d');
  ctx.fillStyle = earthGrad;
  ctx.shadowColor = '#4ade80';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.strokeStyle = '#86efac';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner facets
  ctx.beginPath();
  ctx.moveTo(0, -36);
  ctx.lineTo(0, 36);
  ctx.moveTo(0, 0);
  ctx.lineTo(26, -16);
  ctx.moveTo(0, 0);
  ctx.lineTo(-26, -16);
  ctx.moveTo(0, 0);
  ctx.lineTo(22, 18);
  ctx.moveTo(0, 0);
  ctx.lineTo(-22, 18);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  return canvas.toBuffer('image/png');
}

function generateLightningElement(): Buffer {
  const canvas = createCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  drawCircleBase(ctx, 128, '#fde047', '#713f12', '#eab308');

  // Draw electric bolt
  ctx.save();
  ctx.translate(64, 64);
  ctx.beginPath();
  ctx.moveTo(4, -38);
  ctx.lineTo(-24, 0);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-8, 38);
  ctx.lineTo(24, -2);
  ctx.lineTo(2, -2);
  ctx.closePath();

  const boltGrad = ctx.createLinearGradient(0, -38, 0, 38);
  boltGrad.addColorStop(0, '#ffffff');
  boltGrad.addColorStop(0.5, '#fef08a');
  boltGrad.addColorStop(1, '#eab308');
  ctx.fillStyle = boltGrad;
  ctx.shadowColor = '#facc15';
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.restore();

  return canvas.toBuffer('image/png');
}

function generateLightElement(): Buffer {
  const canvas = createCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  drawCircleBase(ctx, 128, '#ffffff', '#334155', '#fde047');

  // Draw 8-point sunburst
  ctx.save();
  ctx.translate(64, 64);
  ctx.shadowColor = '#fde047';
  ctx.shadowBlur = 14;

  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -36);
    ctx.lineTo(6, -10);
    ctx.lineTo(0, 0);
    ctx.lineTo(-6, -10);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#fef08a';
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  return canvas.toBuffer('image/png');
}

function generateShadowElement(): Buffer {
  const canvas = createCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  drawCircleBase(ctx, 128, '#c084fc', '#3b0764', '#a855f7');

  // Draw void crescent & dark star
  ctx.save();
  ctx.translate(64, 64);
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0.4, Math.PI * 1.8);
  ctx.bezierCurveTo(18, -12, 18, 12, 0, 0);
  ctx.closePath();

  const shadowGrad = ctx.createLinearGradient(-30, -30, 30, 30);
  shadowGrad.addColorStop(0, '#f3e8ff');
  shadowGrad.addColorStop(0.5, '#c084fc');
  shadowGrad.addColorStop(1, '#581c87');
  ctx.fillStyle = shadowGrad;
  ctx.shadowColor = '#c084fc';
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// ─── 2. RARITY STARS (64x64 px) ─────────────────────────────────────────────

function draw5PointStar(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  rOut: number,
  rIn: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? rOut : rIn;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function generateGoldStar(): Buffer {
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');

  ctx.save();
  draw5PointStar(ctx, 32, 32, 28, 12);
  const grad = ctx.createRadialGradient(28, 24, 2, 32, 32, 28);
  grad.addColorStop(0, '#fffbeb');
  grad.addColorStop(0.4, '#fde047');
  grad.addColorStop(0.8, '#f59e0b');
  grad.addColorStop(1, '#b45309');
  ctx.fillStyle = grad;
  ctx.shadowColor = '#eab308';
  ctx.shadowBlur = 8;
  ctx.fill();

  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  return canvas.toBuffer('image/png');
}

function generatePrismaticStar(): Buffer {
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');

  ctx.save();
  draw5PointStar(ctx, 32, 32, 28, 12);
  const grad = ctx.createLinearGradient(8, 8, 56, 56);
  grad.addColorStop(0, '#38bdf8');
  grad.addColorStop(0.25, '#f472b6');
  grad.addColorStop(0.5, '#fde047');
  grad.addColorStop(0.75, '#4ade80');
  grad.addColorStop(1, '#c084fc');
  ctx.fillStyle = grad;
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 10;
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// ─── 3. HOLOGRAPHIC FOILS (800x1200 px) ─────────────────────────────────────

function generateRareFoil(): Buffer {
  const canvas = createCanvas(800, 1200);
  const ctx = canvas.getContext('2d');

  // Diagonal rainbow sheen bands
  ctx.save();
  ctx.translate(400, 600);
  ctx.rotate(-Math.PI / 4);

  const colors = [
    'rgba(239, 68, 68, 0.25)',
    'rgba(249, 115, 22, 0.25)',
    'rgba(234, 179, 8, 0.25)',
    'rgba(34, 197, 94, 0.25)',
    'rgba(59, 130, 246, 0.25)',
    'rgba(168, 85, 247, 0.25)',
  ];

  for (let y = -1200; y < 1200; y += 40) {
    const col = colors[Math.abs(Math.floor(y / 40)) % colors.length];
    ctx.fillStyle = col!;
    ctx.fillRect(-1200, y, 2400, 24);
  }
  ctx.restore();

  return canvas.toBuffer('image/png');
}

function generateSuperRareFoil(): Buffer {
  const canvas = createCanvas(800, 1200);
  const ctx = canvas.getContext('2d');

  // Gold sparkle starlight & diagonal glitter
  const grad = ctx.createLinearGradient(0, 0, 800, 1200);
  grad.addColorStop(0, 'rgba(254, 240, 138, 0.2)');
  grad.addColorStop(0.5, 'rgba(245, 158, 11, 0.35)');
  grad.addColorStop(1, 'rgba(217, 119, 6, 0.2)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 800, 1200);

  // Random sparkle particles
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 200; i++) {
    const x = (i * 37) % 800;
    const y = (i * 53) % 1200;
    const size = (i % 3) + 1.5;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 6;
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}

function generateUltraRareFoil(): Buffer {
  const canvas = createCanvas(800, 1200);
  const ctx = canvas.getContext('2d');

  // Spectral rainbow flares originating from top-left and bottom-right
  const grad1 = ctx.createRadialGradient(200, 200, 50, 400, 400, 600);
  grad1.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
  grad1.addColorStop(0.3, 'rgba(236, 72, 153, 0.35)');
  grad1.addColorStop(0.6, 'rgba(250, 204, 21, 0.3)');
  grad1.addColorStop(1, 'rgba(168, 85, 247, 0.1)');
  ctx.fillStyle = grad1;
  ctx.fillRect(0, 0, 800, 1200);

  // Diagonal multi-angle refraction lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  for (let x = -800; x < 1600; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 600, 1200);
    ctx.stroke();
  }

  return canvas.toBuffer('image/png');
}

function generateSecretRareFoil(): Buffer {
  const canvas = createCanvas(800, 1200);
  const ctx = canvas.getContext('2d');

  // Cross-hatch laser mesh pattern
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.25)';
  ctx.lineWidth = 1.5;
  for (let x = -800; x < 1600; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 800, 1200);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(236, 72, 153, 0.25)';
  for (let x = -800; x < 1600; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 1200);
    ctx.lineTo(x + 800, 0);
    ctx.stroke();
  }

  return canvas.toBuffer('image/png');
}

function generateSirFoil(): Buffer {
  const canvas = createCanvas(800, 1200);
  const ctx = canvas.getContext('2d');

  // Pearlescent wavy full-art shimmer
  const grad = ctx.createLinearGradient(0, 0, 800, 1200);
  grad.addColorStop(0, 'rgba(244, 114, 182, 0.25)');
  grad.addColorStop(0.3, 'rgba(96, 165, 250, 0.3)');
  grad.addColorStop(0.6, 'rgba(253, 224, 71, 0.25)');
  grad.addColorStop(1, 'rgba(192, 132, 252, 0.3)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 800, 1200);

  // Soft luminous waves
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 3;
  for (let y = 50; y < 1200; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(200, y - 40, 600, y + 40, 800, y);
    ctx.stroke();
  }

  return canvas.toBuffer('image/png');
}

function generateMythicFoil(): Buffer {
  const canvas = createCanvas(800, 1200);
  const ctx = canvas.getContext('2d');

  // Cosmic celestial nebula & star cluster
  const grad = ctx.createRadialGradient(400, 500, 50, 400, 600, 700);
  grad.addColorStop(0, 'rgba(253, 224, 71, 0.45)');
  grad.addColorStop(0.3, 'rgba(236, 72, 153, 0.4)');
  grad.addColorStop(0.7, 'rgba(99, 102, 241, 0.35)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.2)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 800, 1200);

  // Large starlight flares
  ctx.fillStyle = '#ffffff';
  const flares = [
    { x: 200, y: 300, r: 8 },
    { x: 600, y: 400, r: 10 },
    { x: 350, y: 750, r: 6 },
    { x: 550, y: 850, r: 7 },
  ];
  for (const f of flares) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.shadowColor = '#fde047';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, 0, f.r, 0, Math.PI * 2);
    ctx.fill();

    // Cross flare
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-f.r * 4, 0);
    ctx.lineTo(f.r * 4, 0);
    ctx.moveTo(0, -f.r * 4);
    ctx.lineTo(0, f.r * 4);
    ctx.stroke();
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

// ─── 4. FRAMES (800x1200 px) ────────────────────────────────────────────────

function generateCommonFrame(): Buffer {
  const canvas = createCanvas(800, 1200);
  const ctx = canvas.getContext('2d');

  // Slate metallic border (width: 20px)
  ctx.lineWidth = 18;
  const grad = ctx.createLinearGradient(0, 0, 800, 1200);
  grad.addColorStop(0, '#64748b');
  grad.addColorStop(0.5, '#475569');
  grad.addColorStop(1, '#334155');
  ctx.strokeStyle = grad;
  ctx.strokeRect(9, 9, 782, 1182);

  // Inner beveled line
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.strokeRect(20, 20, 760, 1160);

  return canvas.toBuffer('image/png');
}

function generateRareFrame(): Buffer {
  const canvas = createCanvas(800, 1200);
  const ctx = canvas.getContext('2d');

  // Polished silver frame
  ctx.lineWidth = 18;
  const grad = ctx.createLinearGradient(0, 0, 800, 1200);
  grad.addColorStop(0, '#f1f5f9');
  grad.addColorStop(0.3, '#cbd5e1');
  grad.addColorStop(0.7, '#94a3b8');
  grad.addColorStop(1, '#64748b');
  ctx.strokeStyle = grad;
  ctx.strokeRect(9, 9, 782, 1182);

  // Corner filigree accents
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#e2e8f0';
  ctx.strokeRect(22, 22, 756, 1156);

  // Corner brackets
  const corners = [
    [22, 22, 40, 40],
    [778, 22, -40, 40],
    [22, 1178, 40, -40],
    [778, 1178, -40, -40],
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x!, y! + dy!);
    ctx.lineTo(x!, y!);
    ctx.lineTo(x! + dx!, y!);
    ctx.stroke();
  }

  return canvas.toBuffer('image/png');
}

function generateSuperRareFrame(): Buffer {
  const canvas = createCanvas(800, 1200);
  const ctx = canvas.getContext('2d');

  // Gilded 24k Gold Frame
  ctx.lineWidth = 20;
  const grad = ctx.createLinearGradient(0, 0, 800, 1200);
  grad.addColorStop(0, '#fef08a');
  grad.addColorStop(0.3, '#fbbf24');
  grad.addColorStop(0.7, '#d97706');
  grad.addColorStop(1, '#92400e');
  ctx.strokeStyle = grad;
  ctx.strokeRect(10, 10, 780, 1180);

  // Inner double border
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fde047';
  ctx.strokeRect(24, 24, 752, 1152);
  ctx.strokeRect(28, 28, 744, 1144);

  return canvas.toBuffer('image/png');
}

function generateUltraRareFrame(): Buffer {
  const canvas = createCanvas(800, 1200);
  const ctx = canvas.getContext('2d');

  // Platinum / Obsidian Frame with Violet Aura
  ctx.lineWidth = 22;
  const grad = ctx.createLinearGradient(0, 0, 800, 1200);
  grad.addColorStop(0, '#e9d5ff');
  grad.addColorStop(0.3, '#c084fc');
  grad.addColorStop(0.7, '#7e22ce');
  grad.addColorStop(1, '#3b0764');
  ctx.strokeStyle = grad;
  ctx.strokeRect(11, 11, 778, 1178);

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#d8b4fe';
  ctx.shadowColor = '#c084fc';
  ctx.shadowBlur = 8;
  ctx.strokeRect(26, 26, 748, 1148);

  return canvas.toBuffer('image/png');
}

function generateMythicFrame(): Buffer {
  const canvas = createCanvas(800, 1200);
  const ctx = canvas.getContext('2d');

  // Cosmic Ornate Gold & Starlight Frame
  ctx.lineWidth = 24;
  const grad = ctx.createLinearGradient(0, 0, 800, 1200);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.2, '#fef08a');
  grad.addColorStop(0.5, '#f59e0b');
  grad.addColorStop(0.8, '#ec4899');
  grad.addColorStop(1, '#8b5cf6');
  ctx.strokeStyle = grad;
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 12;
  ctx.strokeRect(12, 12, 776, 1176);

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fffbeb';
  ctx.strokeRect(28, 28, 744, 1144);

  return canvas.toBuffer('image/png');
}

// ─── MAIN BUILDER ───────────────────────────────────────────────────────────

export async function generateAllTcgAssets(): Promise<void> {
  ensureDirectories();
  console.log('🎨 Generating Waifu TCG PNG Assets into assets/tcg/...\n');

  // Elements
  const elements = [
    { name: 'fire.png', fn: generateFireElement },
    { name: 'ice.png', fn: generateIceElement },
    { name: 'water.png', fn: generateWaterElement },
    { name: 'earth.png', fn: generateEarthElement },
    { name: 'lightning.png', fn: generateLightningElement },
    { name: 'light.png', fn: generateLightElement },
    { name: 'shadow.png', fn: generateShadowElement },
  ];
  for (const el of elements) {
    const p = path.join(ELEMENTS_DIR, el.name);
    fs.writeFileSync(p, el.fn());
    console.log(`  ✓ Element: ${p}`);
  }

  // Stars
  const stars = [
    { name: 'star.png', fn: generateGoldStar },
    { name: 'star_prismatic.png', fn: generatePrismaticStar },
  ];
  for (const s of stars) {
    const p = path.join(STARS_DIR, s.name);
    fs.writeFileSync(p, s.fn());
    console.log(`  ✓ Star: ${p}`);
  }

  // Foils
  const foils = [
    { name: 'rare.png', fn: generateRareFoil },
    { name: 'super_rare.png', fn: generateSuperRareFoil },
    { name: 'ultra_rare.png', fn: generateUltraRareFoil },
    { name: 'secret_rare.png', fn: generateSecretRareFoil },
    { name: 'sir.png', fn: generateSirFoil },
    { name: 'mythic.png', fn: generateMythicFoil },
  ];
  for (const f of foils) {
    const p = path.join(FOILS_DIR, f.name);
    fs.writeFileSync(p, f.fn());
    console.log(`  ✓ Foil: ${p}`);
  }

  // Frames
  const frames = [
    { name: 'common.png', fn: generateCommonFrame },
    { name: 'rare.png', fn: generateRareFrame },
    { name: 'super_rare.png', fn: generateSuperRareFrame },
    { name: 'ultra_rare.png', fn: generateUltraRareFrame },
    { name: 'mythic.png', fn: generateMythicFrame },
  ];
  for (const fr of frames) {
    const p = path.join(FRAMES_DIR, fr.name);
    fs.writeFileSync(p, fr.fn());
    console.log(`  ✓ Frame: ${p}`);
  }

  console.log('\n✨ All TCG PNG assets generated successfully!');
}

// Run directly if invoked as entry point
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  generateAllTcgAssets().catch((err) => {
    console.error('Failed to generate TCG assets:', err);
    process.exit(1);
  });
}
