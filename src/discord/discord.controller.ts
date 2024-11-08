import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Redirect,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ResponseDto } from '#api/response.dto';
import { ConfigService } from '@nestjs/config';

/**
 * Discord Controller
 * @module Discord
 * @author Earnest Angel (https://angel.net.my)
 */
@ApiTags('Ririko Bot')
@Controller({
  path: '/discord',
  version: '1',
})
@Controller('discord')
export class DiscordController {
  constructor(private readonly configService: ConfigService) {}

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
  getInvite(): ResponseDto {
    return {
      data: this.getBotInviteLink(),
      statusCode: HttpStatus.OK,
      success: true,
    };
  }

  getBotInviteLink(permissions = '1075305537'): string {
    return `https://discordapp.com/oauth2/authorize?client_id=${this.configService.get('DISCORD_APPLICATION_ID')}&scope=bot&permissions=${permissions}`;
  }
}
