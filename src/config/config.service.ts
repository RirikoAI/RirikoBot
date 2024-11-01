import { Injectable } from '@nestjs/common';
import { config } from 'dotenv';
import { DocumentBuilder } from "@nestjs/swagger";

@Injectable()
export class ConfigService {
  public readonly apiPort: number;
  public readonly mongoURL: string;

  public readonly discordBotToken: string;
  public readonly discordApplicationId: string;

  public readonly adminPrefix: string;
  public readonly defaultPrefix: string;

  constructor() {
    config();
    this.apiPort = parseInt(process.env.API_PORT) || 3000;
    this.discordBotToken = process.env.DISCORD_BOT_TOKEN || '';
    this.discordApplicationId = process.env.DISCORD_APPLICATION_ID || '';
    this.mongoURL =
      process.env.MONGO_URL || 'mongodb://localhost/ririko';
    this.adminPrefix = process.env.ADMIN_PREIFX || 'admin';
    this.defaultPrefix = process.env.DEFAULT_PREFIX || '!';
  }

  getBotInviteLink(permissions = '1075305537'): string {
    return `https://discordapp.com/oauth2/authorize?client_id=${this.discordApplicationId}&scope=bot&permissions=${permissions}`;
  }
  
  getSwaggerConfig(){
    return new DocumentBuilder()
      .setTitle('Ririko AI')
      .setDescription('Ririko AI Backend API')
      .setVersion('1.0.0')
      .build();
  }
}
