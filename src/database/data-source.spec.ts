import * as dotenv from 'dotenv';

// Load environment variables before importing AppDataSource
dotenv.config({ path: 'src/database/.env.test' });

import { AppDataSource } from './data-source';

describe('AppDataSource', () => {
  it('should be defined', () => {
    expect(AppDataSource).toBeDefined();
  });

  it('should create a DataSource instance with the correct configuration', () => {
    const dataSourceOptions: any = AppDataSource.options;

    expect(dataSourceOptions.type).toBe('sqlite');
    expect(dataSourceOptions.database).toBe(':memory:');
    expect(dataSourceOptions.synchronize).toBe(true);
    expect(dataSourceOptions.logging).toBe(true);
  });

  it('should connect to the database', async () => {
    await expect(AppDataSource.initialize()).resolves.not.toThrow();
    await AppDataSource.destroy();
  });
});
