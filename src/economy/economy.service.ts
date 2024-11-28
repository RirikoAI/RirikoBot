import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ResponseDto } from '#api/response.dto';
import { DiscordMessage } from '#command/command.types';
import { DatabaseService } from '#database/database.service';
import { EconomyExtensions, EconomyServices } from '#economy/economy.module';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export class EconomyService {
  constructor(
    private readonly db: DatabaseService,
    @Inject('ECONOMY_EXTENSIONS')
    readonly extensions: EconomyExtensions,
    @Inject('ECONOMY_SERVICES')
    readonly services: EconomyServices,
  ) {
    this.loadExtensions();
  }

  getBalance = this.extensions.coins.getBalance;
  deductBalance = this.extensions.coins.deductBalance;
  addBalance = this.extensions.coins.addBalance;

  getProfile = this.extensions.profile.getProfile;
  getUser = this.extensions.profile.getUser;
  setBackgroundImageURL = this.extensions.profile.setBackgroundImageURL;

  async handleMessage(message: DiscordMessage): Promise<any> {
    await this.extensions.karma.rewardUserForMessage(message);
    await this.extensions.items.findRandomItems(message.author, message.guild);
  }

  async getEconomyRoot(): Promise<ResponseDto> {
    // get the total number of users
    const totalUsers = await this.db.userRepository.count({
      cache: true,
    });

    return {
      data: `Ririko is serving ${totalUsers} users.`,
      success: true,
      statusCode: HttpStatus.OK,
    };
  }

  loadExtensions() {
    const svcs = Object.keys(this.services);
    for (const key in this.extensions) {
      svcs.forEach((svc) => {
        this.extensions[key][svc] = this.services[svc];
      });
      this.extensions[key]['extensions'] = this.extensions;
    }
  }
}
