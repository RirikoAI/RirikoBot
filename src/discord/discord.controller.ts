import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Redirect,
  Req, UseGuards,
  Version,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseDto } from '#api/response.dto';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { delay } from '#util/api/api.util';
import { GuildDto, GuildsResponseDto } from '#discord/dto/discord.response.dto';
import { Roles } from '#users/roles/roles.decorator';
import { RoleEnum } from '#users/roles/roles.enum';
import { DiscordService } from '#discord/discord.service';
import { DatabaseService } from '#database/database.service';
import { DiscordJweGuard } from '#auth/guards/discord-jwe.guard';

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
    private readonly databaseService: DatabaseService,
  ) {
  }
  
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
  @UseGuards(DiscordJweGuard)
  async guilds(@Req() req: any): Promise<GuildsResponseDto> {
    await delay(1000);
    const discordAccessToken = req['discordAccessToken'];
    const response = await axios.get(
      'https://discord.com/api/users/@me/guilds?with_counts=true',
      {
        headers: { Authorization: `Bearer ${ discordAccessToken }` },
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
  
  @Get('guilds/:guildId/config')
  @ApiOperation({ summary: 'Get guild configuration' })
  @HttpCode(HttpStatus.OK)
  @Roles(RoleEnum.user)
  @UseGuards(DiscordJweGuard)
  async getGuildConfig(@Param('guildId') guildId: string, @Req() req: any): Promise<ResponseDto> {
    const guildConfig = await this.databaseService
      .guildConfigRepository
      .find({
        where: { guild: { id: guildId } },
      });
    
    if (!guildConfig.length) {
      throw new HttpException(
        {
          status: HttpStatus.NOT_FOUND,
          errors: {
            guildConfig: 'notFound',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }
    
    return {
      data: guildConfig,
      statusCode: HttpStatus.OK,
      success: true,
    };
  }
  
  getBotInviteLink(permissions = '626721090433015'): string {
    return `https://discordapp.com/oauth2/authorize?client_id=${ this.configService.get('discord.discordApplicationId') }&scope=bot&permissions=${ permissions }`;
  }
  
  getGuildsTheBotIsIn() {
    return this.discordService.client.guilds.cache;
  }
}
