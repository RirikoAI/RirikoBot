import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { RootService } from './root.service';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ResponseDto } from './response.dto';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@ApiTags('API')
@Controller({
  path: '/',
})
@Controller()
export class RootController {
  constructor(private readonly appService: RootService) {}

  @ApiOkResponse({
    type: ResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  @Get()
  getServiceInfo(): { data: string } {
    return this.appService.getServiceInfo();
  }
}
