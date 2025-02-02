import { Module } from '@nestjs/common';
import { JwksService } from './jwks.service';
import { JwksController } from './jwks.controller';

@Module({
  providers: [JwksService],
  controllers: [JwksController]
})
export class JwksModule {}
