import { MigrationInterface, QueryRunner } from "typeorm";

export class MusicTracks1731828022359 implements MigrationInterface {
    name = 'MusicTracks1731828022359'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "playlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "userId" varchar NOT NULL, "author" varchar NOT NULL, "authorTag" varchar NOT NULL, "public" boolean NOT NULL, "plays" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE TABLE "track" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "url" varchar NOT NULL, "playlistId" integer)`);
        await queryRunner.query(`CREATE TABLE "temporary_track" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "url" varchar NOT NULL, "playlistId" integer, CONSTRAINT "FK_cd57e08e2edf7fd0078a493ffe5" FOREIGN KEY ("playlistId") REFERENCES "playlist" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_track"("id", "name", "url", "playlistId") SELECT "id", "name", "url", "playlistId" FROM "track"`);
        await queryRunner.query(`DROP TABLE "track"`);
        await queryRunner.query(`ALTER TABLE "temporary_track" RENAME TO "track"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "track" RENAME TO "temporary_track"`);
        await queryRunner.query(`CREATE TABLE "track" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "url" varchar NOT NULL, "playlistId" integer)`);
        await queryRunner.query(`INSERT INTO "track"("id", "name", "url", "playlistId") SELECT "id", "name", "url", "playlistId" FROM "temporary_track"`);
        await queryRunner.query(`DROP TABLE "temporary_track"`);
        await queryRunner.query(`DROP TABLE "track"`);
        await queryRunner.query(`DROP TABLE "playlist"`);
    }

}
