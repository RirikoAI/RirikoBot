import { Injectable } from '@nestjs/common';
import { EconomyExtension } from '#economy/extension.class';

@Injectable()
export class CoinsExtension extends EconomyExtension {
  async getBalance(userId: any) {
    let user = await this.db.userRepository.findOne({
      where: {
        id: userId,
      },
    });

    return user.coins;
  }

  async deductBalance(userId: any, amount: number) {
    try {
      let user = await this.db.userRepository.findOne({
        where: {
          id: userId,
        },
      });

      user.coins -= amount;
      await this.db.userRepository.save(user);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async addBalance(userId: any, amount: number) {
    try {
      let user = await this.db.userRepository.findOne({
        where: {
          id: userId,
        },
      });

      user.coins += amount;
      await this.db.userRepository.save(user);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
}
