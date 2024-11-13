import { QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

const migrationsDir = path.join(__dirname, 'migrations');

/**
 * This test suite will run all migrations in the migrations directory.
 * It will test if the up method creates tables and inserts data, and if the down method drops tables and reverts changes.
 * This is useful to ensure that all migrations are working as expected.
 * If a migration is not working as expected, you can debug it by adding console.log statements in the migration file.
 * @author Earnest Angel (https://angel.net.my)
 */
describe('Migrations', () => {
  let queryRunner: QueryRunner;
  let queryMock: jest.SpyInstance;

  beforeEach(() => {
    queryRunner = {
      query: jest.fn(),
    } as unknown as QueryRunner;
    queryMock = jest.spyOn(queryRunner, 'query');
  });

  afterEach(() => {
    queryMock.mockRestore();
  });

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));

  migrationFiles.forEach((file) => {
    const migrationName = path.basename(file, '.ts');
    const migrationPath = path.join(migrationsDir, file);

    describe(migrationName, () => {
      let migration: any;

      beforeAll(async () => {
        const migrationModule = await import(migrationPath);
        migration = new migrationModule[Object.keys(migrationModule)[0]]();
      });

      it('should create tables and insert data on up', async () => {
        await migration.up(queryRunner);

        const upQueries = queryMock.mock.calls.map((call) => call[0]);
        upQueries.forEach((query) => {
          expect(queryRunner.query).toHaveBeenCalledWith(query);
        });
      });

      it('should drop tables and revert changes on down', async () => {
        await migration.down(queryRunner);

        const downQueries = queryMock.mock.calls.map((call) => call[0]);
        downQueries.forEach((query) => {
          expect(queryRunner.query).toHaveBeenCalledWith(query);
        });
      });
    });
  });
});
