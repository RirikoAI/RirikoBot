import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Redirect,
  Req,
  Version,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseDto } from '#api/response.dto';
import { ConfigService } from '@nestjs/config';
import { JweService } from '#jwe/jwe.service';
import axios from 'axios';

/**
 * Discord Controller
 * @module Discord
 * @author Earnest Angel (https://angel.net.my)
 */
@ApiTags('Discord')
@Controller({
  path: '/discord',
  version: '1',
})
@Controller('discord')
export class DiscordController {
  constructor(
    private readonly configService: ConfigService,
    private readonly jweService: JweService,
  ) {}

  @Get('/invite')
  @Redirect('')
  invite() {
    return { url: this.getBotInviteLink() };
  }

  @ApiOkResponse({
    type: ResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  @Get('/get-invite')
  @Version('1')
  getInvite(): ResponseDto {
    return {
      data: this.getBotInviteLink(),
      statusCode: HttpStatus.OK,
      success: true,
    };
  }

  @Get('guilds')
  @ApiOperation({ summary: 'Uses HttpOnly cookie' })
  @HttpCode(HttpStatus.OK)
  async guilds(@Req() req: any) {
    const discordAccessToken = await this.getDiscordAccessToken(req);

    if (!discordAccessToken) {
      throw new HttpException(
        {
          status: HttpStatus.FORBIDDEN,
          errors: {
            discordAccessToken: 'notFound',
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const response = await axios.get(
      'https://discord.com/api/users/@me/guilds',
      {
        headers: { Authorization: `Bearer ${discordAccessToken}` },
      },
    );
    return response.data;
  }

  async getDiscordAccessToken(req: any) {
    const cookies = require('cookie').parse(req.headers['cookie'] || '');
    const encryptedDiscordAccessToken = cookies['discord_access_token'];
    let decryptedAccessToken: any;
    try {
      decryptedAccessToken = await this.jweService.decrypt(
        encryptedDiscordAccessToken,
      );
    } catch (e) {
      return null;
    }
    return decryptedAccessToken;
  }

  /**
   * ToDo: Watch when we receive 401/403 errors from Discord api, then refresh the tokens
   */
  refreshToken() {}

  getBotInviteLink(permissions = '626721090433015'): string {
    return `https://discordapp.com/oauth2/authorize?client_id=${this.configService.get('DISCORD_APPLICATION_ID')}&scope=bot&permissions=${permissions}`;
  }
}
