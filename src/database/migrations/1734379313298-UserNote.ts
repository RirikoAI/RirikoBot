import { MigrationInterface, QueryRunner } from "typeorm";

export class UserNote1734379313298 implements MigrationInterface {
    name = 'UserNote1734379313298'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_note" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "note" varchar NOT NULL, "createdBy" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar, "userId" varchar)`);
        await queryRunner.query(`CREATE TABLE "temporary_user" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "displayName" varchar NOT NULL, "karma" integer NOT NULL DEFAULT (0), "coins" integer NOT NULL DEFAULT (0), "pointsSuspended" boolean NOT NULL DEFAULT (0), "commandsSuspended" boolean NOT NULL DEFAULT (0), "doNotNotifyOnLevelUp" boolean NOT NULL DEFAULT (0), "warns" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "backgroundImageURL" varchar)`);
        await queryRunner.query(`INSERT INTO "temporary_user"("id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt", "backgroundImageURL") SELECT "id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt", "backgroundImageURL" FROM "user"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);
        await queryRunner.query(`CREATE TABLE "temporary_user_note" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "note" varchar NOT NULL, "createdBy" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar, "userId" varchar, CONSTRAINT "FK_51c1d8f260411e99453caa02299" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_236dbd155cee61376a015913576" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_user_note"("id", "note", "createdBy", "createdAt", "updatedAt", "guildId", "userId") SELECT "id", "note", "createdBy", "createdAt", "updatedAt", "guildId", "userId" FROM "user_note"`);
        await queryRunner.query(`DROP TABLE "user_note"`);
        await queryRunner.query(`ALTER TABLE "temporary_user_note" RENAME TO "user_note"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_note" RENAME TO "temporary_user_note"`);
        await queryRunner.query(`CREATE TABLE "user_note" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "note" varchar NOT NULL, "createdBy" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "guildId" varchar, "userId" varchar)`);
        await queryRunner.query(`INSERT INTO "user_note"("id", "note", "createdBy", "createdAt", "updatedAt", "guildId", "userId") SELECT "id", "note", "createdBy", "createdAt", "updatedAt", "guildId", "userId" FROM "temporary_user_note"`);
        await queryRunner.query(`DROP TABLE "temporary_user_note"`);
        await queryRunner.query(`ALTER TABLE "user" RENAME TO "temporary_user"`);
        await queryRunner.query(`CREATE TABLE "user" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "displayName" varchar NOT NULL, "karma" integer NOT NULL DEFAULT (0), "coins" integer NOT NULL DEFAULT (0), "pointsSuspended" boolean NOT NULL DEFAULT (0), "commandsSuspended" boolean NOT NULL DEFAULT (0), "doNotNotifyOnLevelUp" boolean NOT NULL DEFAULT (0), "warns" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL, "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "backgroundImageURL" varchar)`);
        await queryRunner.query(`INSERT INTO "user"("id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt", "backgroundImageURL") SELECT "id", "username", "displayName", "karma", "coins", "pointsSuspended", "commandsSuspended", "doNotNotifyOnLevelUp", "warns", "createdAt", "updatedAt", "backgroundImageURL" FROM "temporary_user"`);
        await queryRunner.query(`DROP TABLE "temporary_user"`);
        await queryRunner.query(`DROP TABLE "user_note"`);
    }

}
