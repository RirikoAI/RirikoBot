import { Module } from '@nestjs/common';
import { JweService } from './jwe.service';
import { JwksModule } from '#jwks/jwks.module';
import { JwksService } from '#jwks/jwks.service';

@Module({
  imports: [JwksModule],
  providers: [JweService, JwksService],
})
export class JweModule {}
