import { Injectable } from '@nestjs/common';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptions,
} from '#command/command.types';

/**
 * Base class for all meme commands.
 * The user enters texts and the bot will generate a meme image.
 * Using Canvas to generate the image.
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export abstract class MemeBase extends Command implements CommandInterface {
  abstract name: string;
  abstract regex: RegExp;
  abstract description: string;
  abstract category: string;
  abstract usageExamples: string[];

  abstract fileName: string;
  abstract slashOptions: SlashCommandOptions;

  abstract textSettings: {
    x: number;
    y: number;
    width: number;
  }[];

  async runSlash(interaction: DiscordInteraction): Promise<any> {
    const texts: string[] = [];
    this.textSettings.forEach((textSetting, index) => {
      if (!interaction.options.getString(this.slashOptions[index].name)) return;
      texts.push(interaction.options.getString(this.slashOptions[index].name));
    });

    const buffer = await this.generateImage(texts);

    // insert buffer into discord.js v14 embedBuilder
    return interaction.reply({ files: [buffer] });
  }

  async runPrefix(message: DiscordMessage): Promise<any> {
    return super.runPrefix(message);
  }

  async generateImage(texts: string[]): Promise<Buffer> {
    const { createCanvas, loadImage } = require('canvas');
    const path = require('path');

    // load image
    const image = await loadImage(
      path.resolve(__dirname, `../../../../assets/memes/${this.fileName}`),
    );

    // Create canvas the same size as the image
    const canvasWidth = image.width;
    const canvasHeight = image.height;

    const canvas1 = createCanvas(canvasWidth, canvasHeight);
    const ctx: CanvasRenderingContext2D = canvas1.getContext('2d');

    ctx.drawImage(image, 0, 0, canvasWidth, canvasHeight);

    // draw texts
    texts.forEach((text, index) => {
      if (!text) return;
      this.drawText(
        ctx,
        text,
        this.textSettings[index].x,
        this.textSettings[index].y,
        this.textSettings[index].width,
      );
    });

    // return image buffer
    return canvas1.toBuffer();
  }

  private drawText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
  ) {
    // create a textbox for texts[0] with max height and max width at x and y location
    ctx.font = 'bold 40px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';

    // set text shadow to thick
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;

    const lineHeight = 35;
    const words = text.split(' ');
    let line = '';
    const lines = [];
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + i * lineHeight);
    }
    return ctx;
  }
}
