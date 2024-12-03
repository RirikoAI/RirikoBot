import { MigrationInterface, QueryRunner } from "typeorm";

export class GuildConfig1732921945292 implements MigrationInterface {
    name = 'GuildConfig1732921945292'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "guild_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "value" varchar NOT NULL, "guildId" varchar)`);
        await queryRunner.query(`CREATE TABLE "temporary_guild_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "value" varchar NOT NULL, "guildId" varchar, CONSTRAINT "FK_d702256aa71bc54b91f0deb040c" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_guild_config"("id", "name", "value", "guildId") SELECT "id", "name", "value", "guildId" FROM "guild_config"`);
        await queryRunner.query(`DROP TABLE "guild_config"`);
        await queryRunner.query(`ALTER TABLE "temporary_guild_config" RENAME TO "guild_config"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "guild_config" RENAME TO "temporary_guild_config"`);
        await queryRunner.query(`CREATE TABLE "guild_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "value" varchar NOT NULL, "guildId" varchar)`);
        await queryRunner.query(`INSERT INTO "guild_config"("id", "name", "value", "guildId") SELECT "id", "name", "value", "guildId" FROM "temporary_guild_config"`);
        await queryRunner.query(`DROP TABLE "temporary_guild_config"`);
        await queryRunner.query(`DROP TABLE "guild_config"`);
    }

}
