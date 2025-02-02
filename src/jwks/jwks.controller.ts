import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwksService } from '#jwks/jwks.service';

@ApiTags('PublicJWKS')
@Controller({
  path: 'jwks',
  version: '1',
})
export class JwksController {
  constructor(private readonly jwksService: JwksService) {}

  @Get('keys')
  publicJwks() {
    return this.jwksService.publicJwks;
  }
}
