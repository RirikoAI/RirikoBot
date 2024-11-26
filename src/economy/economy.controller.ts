import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { EconomyService } from './economy.service';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ResponseDto } from '#api/response.dto';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@ApiTags('API')
@Controller({
  path: '/economy',
  version: '1',
})
@Controller()
export class EconomyController {
  constructor(private readonly economyService: EconomyService) {}

  @ApiOkResponse({
    type: ResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  @Get('/')
  async getEconomyRoot(): Promise<{ data: string }> {
    return await this.economyService.getEconomyRoot();
  }
}
