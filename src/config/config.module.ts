import { forwardRef, Global, Module } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module';
import { ConfigService } from '#config/config.service';

/**
 * The main application module.
 * @author Earnest Angel (https://angel.net.my)
 */
@Global()
@Module({
  imports: [forwardRef(() => DatabaseModule)],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
