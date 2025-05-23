import { forwardRef, Module } from '@nestjs/common';
import { EconomyService } from './economy.service';
import { DiscordModule } from '#discord/discord.module';
import { DatabaseModule } from '#database/database.module';
import { DatabaseService } from '#database/database.service';
import { EconomyExtensionsUtil } from '#util/economy/economy-extensions.util';
import { Extension } from '#economy/economy.types';
import { ItemsExtension } from '#economy/items/items.extension';
import { CoinsExtension } from '#economy/coins/coins.extension';
import { Service } from '#command/command.types';
import { SharedServiceUtil } from '#util/command/shared-service.util';
import { KarmaExtension } from '#economy/karma/karma.extension';
import { ProfileExtension } from '#economy/profile/profile.extension';
import { DiscordService } from '#discord/discord.service';

const modules = [forwardRef(() => DiscordModule), DatabaseModule];

export class AvailableEconomyServices {
  db: DatabaseService = Service(DatabaseService);
  discord: DiscordService = Service(DiscordService);
}

export class AvailableEconomyExtensions {
  items: ItemsExtension = Extension(ItemsExtension);
  coins: CoinsExtension = Extension(CoinsExtension);
  karma: KarmaExtension = Extension(KarmaExtension);
  profile: ProfileExtension = Extension(ProfileExtension);
}

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: modules,
  providers: [
    EconomyExtensionsUtil.getFactory(
      'ECONOMY_EXTENSIONS',
      AvailableEconomyExtensions,
    ),
    SharedServiceUtil.getFactory('ECONOMY_SERVICES', AvailableEconomyServices),
    EconomyService,
    DatabaseService,
  ],
  exports: [EconomyService, 'ECONOMY_EXTENSIONS', 'ECONOMY_SERVICES'],
})
export class EconomyModule {}

export type EconomyExtensions = AvailableEconomyExtensions;

export interface EconomyServices extends AvailableEconomyServices {
  extensions: EconomyExtensions;
}
