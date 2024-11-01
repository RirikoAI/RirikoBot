import { Controller, Get, HttpCode, HttpStatus, Redirect } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ResponseDto } from '../api/response.dto';

@ApiTags('Ririko Bot')
@Controller({
  path: '/discord',
  version: '1',
})
@Controller('discord')
export class DiscordController {
  constructor(private readonly config: ConfigService) {}

  @Get('/invite')
  @Redirect('')
  invite() {
    return { url: this.config.getBotInviteLink() };
  }
  
  @ApiOkResponse({
    type: ResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  @Get('/get-invite')
  getInvite(): ResponseDto {
    return {
      data: this.config.getBotInviteLink(),
      statusCode: HttpStatus.OK,
      success: true,
    };
  }
}
