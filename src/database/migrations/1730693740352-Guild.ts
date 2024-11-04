import { MigrationInterface, QueryRunner } from "typeorm";

export class Guild1730693740352 implements MigrationInterface {
    name = 'Guild1730693740352'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "guild" ("guildId" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "prefix" varchar NOT NULL DEFAULT ('!'))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "guild"`);
    }

}
