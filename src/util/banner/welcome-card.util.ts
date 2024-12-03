import {
  Canvas,
  CanvasRenderingContext2D,
  createCanvas,
  Image,
  loadImage,
} from 'canvas';

export interface WelcomeCardUtilParams {
  badges?: Image[]; // the urls of the badges
  displayName: string;
  avatarURL: string;
  backgroundColor?: string;
  backgroundColor2?: string;
  bubblesColor?: string;
  backgroundImgURL?: string;
  backgroundImgBlur?: number;
  nicknameFont?: string;
  nicknameColor?: string;
  welcomeText?: string;
  borderColor?: string;
  borderColor2?: string;
}

export class WelcomeCard {
  canvas: Canvas;
  ctx: CanvasRenderingContext2D;

  constructor(width: number = 800, height: number = 380) {
    this.canvas = createCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');
  }

  async generate(params: WelcomeCardUtilParams): Promise<Buffer> {
    // node-canvas doesn't have .filter
    await this.drawBackground(params.backgroundColor, params.backgroundColor2);
    await this.drawBubbles(params.bubblesColor);
    if (params.backgroundImgURL) {
      await this.drawBackgroundImage(
        params.backgroundImgURL,
        params.backgroundImgBlur,
      );
    }
    await this.drawProfilePicture(params.avatarURL);
    await this.drawWelcomeText(params.welcomeText);
    await this.drawUserName(params.displayName);
    await this.drawBorder(params.borderColor, params.borderColor2);
    return this.canvas.toBuffer();
  }

  async drawBackground(color1: string = '#7289DA', color2: string = '#23272A') {
    const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  async drawBubbles(color: string = 'rgba(111,255,244,0.63)') {
    const bubbles = 10;
    for (let i = 0; i < bubbles; i++) {
      const x = Math.random() * this.canvas.width;
      const y = Math.random() * this.canvas.height;
      const radius = Math.random() * 10 + 5;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = color;
      this.ctx.fill();
    }
  }

  async drawBackgroundImage(
    url: string,
    blur: number = 10,
    width: number = 800,
    height: number = 380,
    x: number = 0,
    y: number = 0,
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

  /**
   * async drawProfilePicture
   * Places the profile picture in the center of the canvas
   */
  async drawProfilePicture(
    url: string,
    width: number = 190,
    height: number = 190,
    y: number = 35,
    borderRadius: number = 95,
    borderSize: number = 5,
    borderColor: string = '#23272A',
  ) {
    const image = await loadImage(url);
    this.ctx.save();
    // draw avatar at the center of y of the canvas, with border and border radius + borderColor
    this.ctx.beginPath();
    this.ctx.arc(
      this.canvas.width / 2,
      y + height / 2,
      borderRadius,
      0,
      Math.PI * 2,
    );
    this.ctx.closePath();
    this.ctx.clip();
    this.ctx.drawImage(
      image,
      this.canvas.width / 2 - width / 2,
      y,
      width,
      height,
    );
    this.ctx.beginPath();
    this.ctx.arc(
      this.canvas.width / 2,
      y + height / 2,
      borderRadius,
      0,
      Math.PI * 2,
    );
    this.ctx.strokeStyle = borderColor;
    this.ctx.lineWidth = borderSize;
    this.ctx.stroke();
    this.ctx.restore();
  }

  async drawWelcomeText(
    welcomeText: string = 'Welcome',
    font: string = '46px Parkinsans',
    color: string = '#fff',
    y: number = 290,
  ) {
    // center both welcomeText and userName at the center of the canvas
    this.ctx.font = font;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(welcomeText, this.canvas.width / 2, y);
  }

  async drawUserName(
    text: string,
    font: string = '46px Parkinsans',
    color: string = '#fff',
    y: number = 350,
  ) {
    const { ctx } = this;
    // set font weight to bold
    ctx.font = 'bold ' + font;
    // set letter spacing to 1
    ctx.fillStyle = color;
    ctx.fillText(text, this.canvas.width / 2, y);
  }

  // async drawBorder with gradient
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
