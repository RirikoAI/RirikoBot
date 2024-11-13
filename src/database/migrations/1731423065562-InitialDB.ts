import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialDB1731423065562 implements MigrationInterface {
  name = 'InitialDB1731423065562';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "guild" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "prefix" varchar NOT NULL DEFAULT ('!'))`,
    );
    await queryRunner.query(
      `CREATE TABLE "voice_channel" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "parentId" varchar, "guildId" varchar)`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_voice_channel" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "parentId" varchar, "guildId" varchar, CONSTRAINT "FK_e64c66cfcac55ab6f4bc1102d82" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_voice_channel"("id", "name", "parentId", "guildId") SELECT "id", "name", "parentId", "guildId" FROM "voice_channel"`,
    );
    await queryRunner.query(`DROP TABLE "voice_channel"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_voice_channel" RENAME TO "voice_channel"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "voice_channel" RENAME TO "temporary_voice_channel"`,
    );
    await queryRunner.query(
      `CREATE TABLE "voice_channel" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "parentId" varchar, "guildId" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "voice_channel"("id", "name", "parentId", "guildId") SELECT "id", "name", "parentId", "guildId" FROM "temporary_voice_channel"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_voice_channel"`);
    await queryRunner.query(`DROP TABLE "voice_channel"`);
    await queryRunner.query(`DROP TABLE "guild"`);
  }
}
