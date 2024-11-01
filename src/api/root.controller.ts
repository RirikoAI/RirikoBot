import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { RootService } from './root.service';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ResponseDto } from "./response.dto";

@ApiTags('API')
@Controller({
  path: '/',
  version: '1',
})
@Controller()
export class RootController {
  constructor(private readonly appService: RootService) {}
  
  @ApiOkResponse({
    type: ResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  @Get()
  getHello(): { data: string } {
    return this.appService.getHello();
  }
}
