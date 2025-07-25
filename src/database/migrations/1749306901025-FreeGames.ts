import { MigrationInterface, QueryRunner } from "typeorm";

export class Migrations1749306901025 implements MigrationInterface {
    name = 'Migrations1749306901025'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "free_game_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "gameId" varchar NOT NULL, "gameName" varchar NOT NULL, "source" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "guildId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE TABLE "temporary_free_game_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "gameId" varchar NOT NULL, "gameName" varchar NOT NULL, "source" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "guildId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_d8c1952edfddb4c55bd310d98b2" FOREIGN KEY ("guildId") REFERENCES "guild" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_free_game_notification"("id", "gameId", "gameName", "source", "notified", "guildId", "createdAt", "updatedAt") SELECT "id", "gameId", "gameName", "source", "notified", "guildId", "createdAt", "updatedAt" FROM "free_game_notification"`);
        await queryRunner.query(`DROP TABLE "free_game_notification"`);
        await queryRunner.query(`ALTER TABLE "temporary_free_game_notification" RENAME TO "free_game_notification"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "free_game_notification" RENAME TO "temporary_free_game_notification"`);
        await queryRunner.query(`CREATE TABLE "free_game_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "gameId" varchar NOT NULL, "gameName" varchar NOT NULL, "source" varchar NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "guildId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "free_game_notification"("id", "gameId", "gameName", "source", "notified", "guildId", "createdAt", "updatedAt") SELECT "id", "gameId", "gameName", "source", "notified", "guildId", "createdAt", "updatedAt" FROM "temporary_free_game_notification"`);
        await queryRunner.query(`DROP TABLE "temporary_free_game_notification"`);
        await queryRunner.query(`DROP TABLE "free_game_notification"`);
    }

}
