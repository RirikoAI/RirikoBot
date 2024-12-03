import { HttpStatus, Injectable } from '@nestjs/common';
import { ResponseDto } from './response.dto';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export class RootService {
  getServiceInfo(): ResponseDto {
    return {
      data: {
        name: process.env.npm_package_name,
        version: process.env.npm_package_version,
        env: process.env.NODE_ENV,
      },
      success: true,
      statusCode: HttpStatus.OK,
    };
  }
}
