import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';

/**
 * Module for AI services
 * Provides the AIServiceFactory which can be used to create AI service instances
 */
@Module({
  imports: [ConfigModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
