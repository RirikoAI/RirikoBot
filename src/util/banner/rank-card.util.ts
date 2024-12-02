import { PresenceStatus } from 'discord.js/typings';
import {
  createCanvas,
  Canvas,
  CanvasRenderingContext2D,
  loadImage,
  Image,
} from 'canvas';

export interface RankCardUtilParams {
  badges?: Image[]; // the urls of the badges
  presenceStatus: PresenceStatus;
  displayName: string;
  level: string;
  currentExp: number;
  requiredExp: number;
  avatarURL: string;
  backgroundColor?: string;
  bubblesColor?: string;
  backgroundImgURL?: string;
  backgroundImgBlur?: number;
  nicknameFont?: string;
  nicknameColor?: string;
}

/**
 * Banner Generator
 * @author Earnest Angel (https://angel.net.my)
 */
export class RankCard {
  canvas: Canvas;
  ctx: CanvasRenderingContext2D;

  constructor(width: number = 800, height: number = 240) {
    this.canvas = createCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');
  }

  async generateBanner(params: RankCardUtilParams) {
    let formatter = Intl.NumberFormat('en', { notation: 'compact' });

    await this.drawBackground(params.backgroundColor);

    if (params.backgroundImgURL) {
      await this.drawBackgroundImage(
        params.backgroundImgURL,
        params.backgroundImgBlur,
      );
    } else {
      await this.drawBubbles(params.bubblesColor);
    }

    await this.drawProfilePicture(params.avatarURL, params.presenceStatus);
    await this.drawProgressBar(params.currentExp, params.requiredExp);
    await this.drawDisplayName(params.displayName);
    await this.drawLeftFooterText(
      `${formatter.format(params.currentExp)} / ${formatter.format(params.requiredExp)} Karma`,
      'Rank #1',
    );
    await this.drawRightFooterText(params.level);

    if (params.badges.length > 0) await this.drawBadges(params.badges);
    await this.drawBorder();

    // Convert canvas to buffer
    return this.canvas.toBuffer('image/png');
  }

  drawBackground(
    color1: string = 'rgba(61,255,243,0.74)',
    color2: string = '#138ad3',
  ) {
    const { ctx, canvas } = this;
    // make background gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawBubbles(color: string = 'rgba(111,255,244,0.63)') {
    const { ctx, canvas } = this;
    const bubbles = 50;
    for (let i = 0; i < bubbles; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = Math.random() * 20;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2, false);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  async drawProfilePicture(
    url: string,
    presenceStatus: PresenceStatus,
    x: number = 35,
    y: number = 25,
    width: number = 190,
    height: number = 190,
  ) {
    const { ctx } = this;
    const avatar = await loadImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + width / 2, y + height / 2, width / 2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, x, y, width, height);
    ctx.restore();

    let size = 20;
    switch (presenceStatus) {
      case 'online':
        size = 20;
        ctx.fillStyle = '#43b581';
        ctx.beginPath();
        ctx.arc(x + width - 20, y + height - 20, size, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.fill();
        break;
      case 'idle':
        size = 50;
        // load the image from the path /assets/icons/idle.png
        const status = await loadImage('./assets/icons/idle.png');
        ctx.drawImage(status, x + width - size, y + height - size, size, size);
        ctx.restore();
        break;
      case 'dnd':
        ctx.fillStyle = '#f04747';
        size = 20;
        ctx.beginPath();
        ctx.arc(x + width - 20, y + height - 20, size, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.fill();
        break;
      case 'offline':
        ctx.fillStyle = '#747f8d';
        size = 20;
        ctx.beginPath();
        ctx.arc(x + width - 20, y + height - 20, size, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.fill();
        break;
    }
  }

  async drawProgressBar(
    current: number,
    required: number,
    x: number = 250,
    y: number = 135,
    width: number = 510,
    height: number = 40,
  ) {
    // create a rounded progress bar with a border
    const { ctx } = this;
    const progress = (current / required) * width;
    const borderRadius = height / 2;

    // draw the background bar
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(
      x + borderRadius,
      y + borderRadius,
      borderRadius,
      Math.PI / 2,
      Math.PI * 1.5,
    );
    ctx.arc(
      x + width - borderRadius,
      y + borderRadius,
      borderRadius,
      Math.PI * 1.5,
      Math.PI / 2,
    );
    ctx.closePath();
    ctx.fill();

    // draw the progress bar
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.arc(
      x + borderRadius,
      y + borderRadius,
      borderRadius,
      Math.PI / 2,
      Math.PI * 1.5,
    );
    ctx.arc(
      x + borderRadius + progress,
      y + borderRadius,
      borderRadius,
      Math.PI * 1.5,
      Math.PI / 2,
    );
    ctx.closePath();
    ctx.fill();
  }

  async drawDisplayName(
    text: string,
    font: string = '46px Parkinsans',
    color: string = '#fff',
    x: number = 250,
    y: number = 110,
  ) {
    const { ctx } = this;
    // set font weight to bold
    ctx.font = 'bold ' + font;
    // set letter spacing to 1
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  async drawLeftFooterText(
    leftAlignedText: string,
    rightAlignedText: string,
    font: string = '20px Parkinsans',
    color: string = '#fff',
    x: number = 250,
    y: number = 195,
  ) {
    const height = 30;
    const width = 350;

    const borderRadius = height / 2;
    const { ctx } = this;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(
      x + borderRadius,
      y + borderRadius,
      borderRadius,
      Math.PI / 2,
      Math.PI * 1.5,
    );
    ctx.arc(
      x + width - borderRadius,
      y + borderRadius,
      borderRadius,
      Math.PI * 1.5,
      Math.PI / 2,
    );
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.font = font;
    ctx.fillStyle = color;
    // align the text of leftAlignedText to the left of the bar
    ctx.fillText(leftAlignedText, x + 10, y + 22);
    // align the text of rightAlignedText to the right of the bar, bold and white color
    ctx.font = 'bold ' + font;
    ctx.fillStyle = '#ffdb03';
    const textWidth = ctx.measureText(rightAlignedText).width;
    ctx.fillText(rightAlignedText, x + width - textWidth - 10, y + 22);
  }

  async drawRightFooterText(
    text: string,
    font: string = '20px Parkinsans',
    color: string = '#fff',
    x: number = 610,
    y: number = 195,
  ) {
    const height = 30;
    const width = 150;

    const borderRadius = height / 2;
    const { ctx } = this;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(
      x + borderRadius,
      y + borderRadius,
      borderRadius,
      Math.PI / 2,
      Math.PI * 1.5,
    );
    ctx.arc(
      x + width - borderRadius,
      y + borderRadius,
      borderRadius,
      Math.PI * 1.5,
      Math.PI / 2,
    );
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.font = font;
    ctx.fillStyle = color;
    const textWidth = ctx.measureText(text).width;
    ctx.fillText(text, x + width / 2 - textWidth / 2, y + 22);
  }

  async drawBadges(badges: Image[], x = 735, y = 20, height = 50) {
    let width = 0;
    let badgeSize = height - 6;

    let adjustment = 12;
    if (badges.length === 1 || badges.length === 2) {
      adjustment = 15;
    }

    // @ts-ignore
    for (const badge of badges) {
      width += badgeSize - 10;
    }

    const { ctx } = this;

    // draw the bar
    let barWidth = 0;
    // @ts-ignore
    for (const badge of badges) {
      barWidth += badgeSize - adjustment;
    }

    // draw the bar transparent rounded bar
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(
      x - barWidth,
      y + height / 2 - 4,
      height / 2,
      Math.PI / 2,
      Math.PI * 1.5,
    );
    ctx.arc(x, y + height / 2 - 4, height / 2, Math.PI * 1.5, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    x -= width;
    for (const badge of badges) {
      ctx.globalAlpha = 1;
      ctx.drawImage(badge, x, y, badgeSize, badgeSize);
      x += badgeSize - 9;
    }
  }

  async drawBackgroundImage(
    url: string,
    blur: number = 10,
    x: number = 0,
    y: number = 0,
    width: number = 800,
    height: number = 240,
  ) {
    const { ctx } = this;
    const img = await loadImage(url);
    const canvas = createCanvas(width, height);
    const ctx2 = canvas.getContext('2d');
    ctx2.drawImage(img, x, y, width, height);
    ctx2.drawImage(img, x, y, width, height);
    const stackblur = require('stackblur-canvas');
    stackblur.canvasRGBA(canvas, x, y, width, height, blur);
    ctx.drawImage(canvas, x, y, width, height);
  }

  async drawBorder(
    color1: string = '#6ffff4',
    color2: string = '#1881c2',
    width: number = 15,
  ) {
    const { ctx, canvas } = this;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);

    const borderRadius = 20;
    ctx.lineWidth = width;
    ctx.strokeStyle = gradient;
    ctx.beginPath();
    ctx.arc(borderRadius, borderRadius, borderRadius, Math.PI, 1.5 * Math.PI);
    ctx.arc(
      canvas.width - borderRadius,
      borderRadius,
      borderRadius,
      1.5 * Math.PI,
      2 * Math.PI,
    );
    ctx.arc(
      canvas.width - borderRadius,
      canvas.height - borderRadius,
      borderRadius,
      0,
      0.5 * Math.PI,
    );
    ctx.arc(
      borderRadius,
      canvas.height - borderRadius,
      borderRadius,
      0.5 * Math.PI,
      Math.PI,
    );
    ctx.closePath();
    ctx.stroke();
  }
}
