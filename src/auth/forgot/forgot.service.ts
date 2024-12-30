import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptions } from '#util/types/find-options.type';
import { DeepPartial, Repository } from 'typeorm';
import { Forgot } from '#database/entities/forgot.entity';
import { NullableType } from '#util/types/nullable.type';

@Injectable()
export class ForgotService {
  constructor(
    @InjectRepository(Forgot)
    private readonly forgotRepository: Repository<Forgot>,
  ) {}

  async findOne(options: FindOptions<Forgot>): Promise<NullableType<Forgot>> {
    return this.forgotRepository.findOne({
      where: options.where,
    });
  }

  async findMany(options: FindOptions<Forgot>): Promise<Forgot[]> {
    return this.forgotRepository.find({
      where: options.where,
    });
  }

  async create(data: DeepPartial<Forgot>): Promise<Forgot> {
    return this.forgotRepository.save(this.forgotRepository.create(data));
  }

  async softDelete(id: Forgot['id']): Promise<void> {
    await this.forgotRepository.softDelete(id);
  }
}
