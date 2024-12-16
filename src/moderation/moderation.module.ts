import { Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';

@Module({
  providers: [ModerationService]
})
export class ModerationModule {}
