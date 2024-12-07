import { Test, TestingModule } from '@nestjs/testing';
import { CoinsExtension } from './coins.extension';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '#database/entities/user.entity';

describe('CoinsExtension', () => {
  let coinsExtension: CoinsExtension;
  let userRepository: Repository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoinsExtension,
        {
          provide: getRepositoryToken(User),
          useClass: Repository,
        },
      ],
    }).compile();

    coinsExtension = module.get<CoinsExtension>(CoinsExtension);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    (coinsExtension as any).db = {
      userRepository,
    };
  });

  it('should be defined', () => {
    expect(coinsExtension).toBeDefined();
  });

  describe('getBalance', () => {
    it('should return user balance', async () => {
      const userId = 1;
      const user = { id: userId, coins: 100 } as any as User;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);

      const balance = await coinsExtension.getBalance(userId);
      expect(balance).toBe(100);
    });
  });

  describe('deductBalance', () => {
    it('should deduct balance from user', async () => {
      const userId = 1;
      const user = { id: userId, coins: 100 } as any as User;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);
      jest.spyOn(userRepository, 'save').mockResolvedValue(user);

      const result = await coinsExtension.deductBalance(userId, 50);
      expect(result).toBe(true);
      expect(user.coins).toBe(50);
    });

    it('should return false if an error occurs', async () => {
      jest
        .spyOn(userRepository, 'findOne')
        .mockRejectedValue(new Error('Example Error'));

      const result = await coinsExtension.deductBalance(1, 50);
      expect(result).toBe(false);
    });
  });

  describe('addBalance', () => {
    it('should add balance to user', async () => {
      const userId = 1;
      const user = { id: userId, coins: 100 } as any as User;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);
      jest.spyOn(userRepository, 'save').mockResolvedValue(user);

      const result = await coinsExtension.addBalance(userId, 50);
      expect(result).toBe(true);
      expect(user.coins).toBe(150);
    });

    it('should return false if an error occurs', async () => {
      jest
        .spyOn(userRepository, 'findOne')
        .mockRejectedValue(new Error('Example Error'));

      const result = await coinsExtension.addBalance(1, 50);
      expect(result).toBe(false);
    });
  });
});
