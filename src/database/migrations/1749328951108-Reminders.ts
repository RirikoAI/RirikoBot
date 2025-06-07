import { MigrationInterface, QueryRunner } from "typeorm";

export class Migrations1749328951108 implements MigrationInterface {
    name = 'Migrations1749328951108'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "reminder" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "channelId" varchar NOT NULL, "guildId" varchar NOT NULL, "message" varchar NOT NULL, "scheduledTime" datetime NOT NULL, "sent" boolean NOT NULL DEFAULT (0), "timezone" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "reminder"`);
    }

}
