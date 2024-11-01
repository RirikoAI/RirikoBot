import { HttpStatus, Injectable } from '@nestjs/common';
import { ResponseDto } from './response.dto';

@Injectable()
export class RootService {
  getHello(): ResponseDto {
    return {
      data: 'Hello World!',
      success: true,
      statusCode: HttpStatus.OK,
    };
  }
}
