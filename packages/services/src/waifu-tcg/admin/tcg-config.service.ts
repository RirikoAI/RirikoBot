import { z } from 'zod';
import type { TcgConfigRepository } from '@ririko/database';

export const TcgConfigKeySchema = z.enum([
  'global_max_energy_cap',
  'base_energy_capacity',
  'energy_scaling_per_level',
  'daily_energy_restore_pot_limit',
  'daily_replenish_cron',
  'dungeon_scaling_model',
  'dungeon_growth_rate',
  'market_tax_rate',
  'tcg_manager_role_id',
]);

export type TcgConfigKey = z.infer<typeof TcgConfigKeySchema>;

export const TcgConfigSchemas = {
  global_max_energy_cap: z.number().int().min(100).max(1000).default(300),
  base_energy_capacity: z.number().int().min(50).max(200).default(100),
  energy_scaling_per_level: z.number().int().min(1).max(5).default(2),
  daily_energy_restore_pot_limit: z.number().int().min(1).max(10).default(3),
  daily_replenish_cron: z.string().min(5).default('0 0 * * *'),
  dungeon_scaling_model: z
    .enum(['LINEAR', 'POLYNOMIAL', 'EXPONENTIAL', 'HYBRID'])
    .default('HYBRID'),
  dungeon_growth_rate: z.number().min(0.03).max(0.25).default(0.085),
  market_tax_rate: z.number().min(0.0).max(0.5).default(0.05),
  tcg_manager_role_id: z.string().default(''),
};

export interface AllTcgConfigs {
  global_max_energy_cap: number;
  base_energy_capacity: number;
  energy_scaling_per_level: number;
  daily_energy_restore_pot_limit: number;
  daily_replenish_cron: string;
  dungeon_scaling_model: 'LINEAR' | 'POLYNOMIAL' | 'EXPONENTIAL' | 'HYBRID';
  dungeon_growth_rate: number;
  market_tax_rate: number;
  tcg_manager_role_id: string;
}

export class TcgConfigService {
  constructor(private readonly configRepo: TcgConfigRepository) {}

  /**
   * Retrieves a typed configuration value by key with default fallback.
   */
  async getConfig<K extends TcgConfigKey>(key: K): Promise<z.infer<(typeof TcgConfigSchemas)[K]>> {
    const raw = await this.configRepo.getConfig(key);
    const schema = TcgConfigSchemas[key];

    if (raw === null || raw === undefined) {
      return schema.parse(undefined);
    }

    return schema.parse(raw);
  }

  /**
   * Validates and saves a configuration value.
   */
  async setConfig<K extends TcgConfigKey>(
    key: K,
    rawValue: unknown,
    updatedBy: string,
  ): Promise<z.infer<(typeof TcgConfigSchemas)[K]>> {
    const schema = TcgConfigSchemas[key];
    const parsed = schema.parse(rawValue);

    await this.configRepo.setConfig(key, parsed, updatedBy);
    return parsed;
  }

  /**
   * Retrieves all global TCG configurations with defaults applied.
   */
  async getAllConfigs(): Promise<AllTcgConfigs> {
    const rawAll = await this.configRepo.getAllConfigs();

    return {
      global_max_energy_cap: TcgConfigSchemas.global_max_energy_cap.parse(
        rawAll['global_max_energy_cap'],
      ),
      base_energy_capacity: TcgConfigSchemas.base_energy_capacity.parse(
        rawAll['base_energy_capacity'],
      ),
      energy_scaling_per_level: TcgConfigSchemas.energy_scaling_per_level.parse(
        rawAll['energy_scaling_per_level'],
      ),
      daily_energy_restore_pot_limit: TcgConfigSchemas.daily_energy_restore_pot_limit.parse(
        rawAll['daily_energy_restore_pot_limit'],
      ),
      daily_replenish_cron: TcgConfigSchemas.daily_replenish_cron.parse(
        rawAll['daily_replenish_cron'],
      ),
      dungeon_scaling_model: TcgConfigSchemas.dungeon_scaling_model.parse(
        rawAll['dungeon_scaling_model'],
      ),
      dungeon_growth_rate: TcgConfigSchemas.dungeon_growth_rate.parse(
        rawAll['dungeon_growth_rate'],
      ),
      market_tax_rate: TcgConfigSchemas.market_tax_rate.parse(rawAll['market_tax_rate']),
      tcg_manager_role_id: TcgConfigSchemas.tcg_manager_role_id.parse(
        rawAll['tcg_manager_role_id'],
      ),
    };
  }

  /**
   * Checks if an invoker is authorized to perform TCG administration.
   */
  async isAuthorized(options: {
    memberRoles?: string[] | undefined;
    isServerAdmin?: boolean | undefined;
  }): Promise<boolean> {
    if (options.isServerAdmin) {
      return true;
    }

    const managerRoleId = await this.getConfig('tcg_manager_role_id');
    if (!managerRoleId) {
      return false;
    }

    return options.memberRoles?.includes(managerRoleId) ?? false;
  }
}
