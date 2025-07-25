import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1753428868386 implements MigrationInterface {
  name = 'Migrations1753428868386';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "reaction_role" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "messageId" varchar NOT NULL, "emoji" varchar NOT NULL, "roleId" varchar NOT NULL, "guildId" varchar)`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_reaction_role" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "messageId" varchar NOT NULL, "emoji" varchar NOT NULL, "roleId" varchar NOT NULL, "guildId" varchar, CONSTRAINT "FK_3959343ea6e44ecef758a345642" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_reaction_role"("id", "messageId", "emoji", "roleId", "guildId") SELECT "id", "messageId", "emoji", "roleId", "guildId" FROM "reaction_role"`,
    );
    await queryRunner.query(`DROP TABLE "reaction_role"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_reaction_role" RENAME TO "reaction_role"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reaction_role" RENAME TO "temporary_reaction_role"`,
    );
    await queryRunner.query(
      `CREATE TABLE "reaction_role" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "messageId" varchar NOT NULL, "emoji" varchar NOT NULL, "roleId" varchar NOT NULL, "guildId" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "reaction_role"("id", "messageId", "emoji", "roleId", "guildId") SELECT "id", "messageId", "emoji", "roleId", "guildId" FROM "temporary_reaction_role"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_reaction_role"`);
    await queryRunner.query(`DROP TABLE "reaction_role"`);
  }
}
