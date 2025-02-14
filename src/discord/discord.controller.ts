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
import { delay } from '#util/api/api.util';
import { GuildDto, GuildsResponseDto } from '#discord/dto/discord.response.dto';
import { Roles } from '#users/roles/roles.decorator';
import { RoleEnum } from '#users/roles/roles.enum';
import { DiscordService } from '#discord/discord.service';

// import { Permissions } from 'discord.js';

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
    private readonly discordService: DiscordService,
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
  @Roles(RoleEnum.user)
  async guilds(@Req() req: any): Promise<GuildsResponseDto> {
    await delay(1000);
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
      'https://discord.com/api/users/@me/guilds?with_counts=true',
      {
        headers: { Authorization: `Bearer ${discordAccessToken}` },
      },
    );

    const MANAGE_GUILD = 0x20; // 32 in decimal

    const guildsTheBotIsIn = this.getGuildsTheBotIsIn();

    // Assume response.data is of type Guild[]
    const guilds: GuildDto[] = response.data
      .map((guild) => ({
        ...guild,
        bot_in_guild: guildsTheBotIsIn.has(guild.id),
        can_manage_server:
          guild.owner || (guild.permissions & MANAGE_GUILD) === MANAGE_GUILD,
      }))
      .sort((a, b) => Number(b.bot_in_guild) - Number(a.bot_in_guild))
      .sort(
        (a, b) => Number(b.can_manage_server) - Number(a.can_manage_server),
      );
    return guilds;
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

  getGuildsTheBotIsIn() {
    return this.discordService.client.guilds.cache;
  }
}
