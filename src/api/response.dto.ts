import { ApiProperty } from '@nestjs/swagger';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
export class ResponseDto {
  @ApiProperty({
    example: 'Hello World!',
    description: 'Any response data from the server',
  })
  data: any;

  @ApiProperty()
  success: true;
  @ApiProperty({
    example: 200,
    description: 'HTTP status code (HttpStatus.OK)',
  })
  statusCode: number;
}
