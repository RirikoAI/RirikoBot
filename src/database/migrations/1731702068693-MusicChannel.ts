import { MigrationInterface, QueryRunner } from 'typeorm';

export class MusicChannel1731702068693 implements MigrationInterface {
  name = 'MusicChannel1731702068693';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "music_channel" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "guildId" varchar)`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_music_channel" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "guildId" varchar, CONSTRAINT "FK_6148e98fda68aa504c141a05600" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_music_channel"("id", "name", "guildId") SELECT "id", "name", "guildId" FROM "music_channel"`,
    );
    await queryRunner.query(`DROP TABLE "music_channel"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_music_channel" RENAME TO "music_channel"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "music_channel" RENAME TO "temporary_music_channel"`,
    );
    await queryRunner.query(
      `CREATE TABLE "music_channel" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "guildId" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "music_channel"("id", "name", "guildId") SELECT "id", "name", "guildId" FROM "temporary_music_channel"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_music_channel"`);
    await queryRunner.query(`DROP TABLE "music_channel"`);
  }
}
