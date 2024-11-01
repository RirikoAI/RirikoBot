import { Module } from '@nestjs/common';
import { RootController } from './api/root.controller';
import { RootService } from './api/root.service';

@Module({
  imports: [],
  controllers: [RootController],
  providers: [RootService],
})
export class AppModule {}
